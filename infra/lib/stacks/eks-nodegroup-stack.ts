import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';

interface IProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  clusterName: string;
  clusterSecurityGroupId: string;
  mskSecurityGroupId: string;
  rdsSecurityGroupId: string;
}

export class EksNodeGroupStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id, props);

    const securityGroup = this.newSecurityGroup(props);
    const launchTemplate = this.newLaunchTemplate(securityGroup);

    this.newNodeGroup(props, launchTemplate);

    this.newEcrApiEndpoint(props.vpc, securityGroup);
    this.newEcrDockerEndpoint(props.vpc, securityGroup);
    this.newS3Endpoint(props.vpc);
  }

  newLaunchTemplate(securityGroup: ec2.ISecurityGroup): ec2.LaunchTemplate {
    const ns = this.node.tryGetContext('ns') as string;

    return new ec2.LaunchTemplate(this, 'LaunchTemplate', {
      launchTemplateName: ns.toLowerCase(),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.M5,
        ec2.InstanceSize.LARGE
      ),
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          mappingEnabled: true,
          volume: ec2.BlockDeviceVolume.ebs(128, {
            deleteOnTermination: true,
            volumeType: ec2.EbsDeviceVolumeType.GP2,
            encrypted: true,
          }),
        },
      ],
      securityGroup,
    });
  }

  newNodeGroup(
    props: IProps,
    launchTemplate: ec2.LaunchTemplate
  ): eks.Nodegroup {
    const ns = this.node.tryGetContext('ns') as string;

    const nodeRole = new iam.Role(this, 'NodeRole', {
      roleName: `${ns}NodeRole`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonEC2ContainerRegistryReadOnly'
        ),
      ],
    });

    const cluster = eks.Cluster.fromClusterAttributes(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: props.clusterName,
    });

    const nodeGroup = new eks.Nodegroup(this, 'NodeGroup', {
      cluster,
      nodegroupName: ns.toLowerCase(),
      nodeRole,
      desiredSize: 2,
      maxSize: 4,
      launchTemplateSpec: {
        id: launchTemplate.launchTemplateId!,
      },
    });
    return nodeGroup;
  }

  newSecurityGroup(props: IProps): ec2.SecurityGroup {
    const ns = this.node.tryGetContext('ns') as string;

    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      securityGroupName: `${ns}NodeSecurityGroup`,
      vpc: props.vpc,
    });
    securityGroup.connections.allowInternally(
      ec2.Port.allTraffic(),
      'All traffic for self'
    );
    securityGroup.connections.allowFrom(
      ec2.Peer.securityGroupId(props.clusterSecurityGroupId),
      ec2.Port.allTraffic(),
      'EKS Control to NodeGroup'
    );

    const mskSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      `MskSecurityGroup`,
      props.mskSecurityGroupId
    );
    mskSecurityGroup.addIngressRule(
      securityGroup,
      ec2.Port.tcp(9094),
      'NodeGroup to MSK'
    );

    const rdsSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      `RdsSecurityGroup`,
      props.rdsSecurityGroupId
    );
    rdsSecurityGroup.addIngressRule(
      securityGroup,
      ec2.Port.tcp(3306),
      'NodeGroup to RDS'
    );

    return securityGroup;
  }

  newEcrApiEndpoint(vpc: ec2.IVpc, securityGroup: ec2.ISecurityGroup) {
    const endpoint = new ec2.InterfaceVpcEndpoint(this, 'EcrApiVpcEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      subnets: {
        subnets: vpc.privateSubnets,
      },
      privateDnsEnabled: true,
    });

    endpoint.connections.allowFrom(
      ec2.Peer.securityGroupId(securityGroup.securityGroupId),
      ec2.Port.tcp(443),
      'EKS to ECR'
    );
  }

  newEcrDockerEndpoint(vpc: ec2.IVpc, securityGroup: ec2.ISecurityGroup) {
    const endpoint = new ec2.InterfaceVpcEndpoint(
      this,
      'EcrDockerVpcEndpoint',
      {
        vpc,
        service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        subnets: {
          subnets: vpc.privateSubnets,
        },
        privateDnsEnabled: true,
      }
    );

    endpoint.connections.allowFrom(
      ec2.Peer.securityGroupId(securityGroup.securityGroupId),
      ec2.Port.tcp(443),
      'EKS to ECR'
    );
  }

  newS3Endpoint(vpc: ec2.IVpc) {
    new ec2.GatewayVpcEndpoint(this, 'S3VpcEndpoint', {
      vpc,
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        {
          subnets: vpc.privateSubnets,
        },
      ],
    });
  }
}
