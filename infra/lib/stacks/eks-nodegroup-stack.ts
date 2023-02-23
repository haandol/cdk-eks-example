import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';

interface IProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  clusterName: string;
  clusterSecurityGroupId: string;
  mskSecurityGroupId?: string;
  rdsSecurityGroupId?: string;
}

export class EksNodeGroupStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id, props);

    const securityGroup = this.newSecurityGroup(props);
    this.newEc2Endpoint(props.vpc, securityGroup);
    this.newEcrApiEndpoint(props.vpc, securityGroup);
    this.newEcrDockerEndpoint(props.vpc, securityGroup);
    this.newS3Endpoint(props.vpc);

    const template = this.newLaunchTemplate(securityGroup);
    this.newNodeGroup(props, template);
  }

  newLaunchTemplate(securityGroup: ec2.ISecurityGroup): ec2.ILaunchTemplate {
    const ns = this.node.tryGetContext('ns') as string;

    return new ec2.LaunchTemplate(this, 'LaunchTemplate', {
      launchTemplateName: `${ns}LaunchTemplate`,
      securityGroup,
      detailedMonitoring: true,
      requireImdsv2: true,
      httpTokens: ec2.LaunchTemplateHttpTokens.REQUIRED,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          mappingEnabled: true,
          volume: ec2.BlockDeviceVolume.ebs(256, {
            deleteOnTermination: true,
            volumeType: ec2.EbsDeviceVolumeType.GP2,
            encrypted: true,
          }),
        },
      ],
    });
  }

  newNodeGroup(props: IProps, template: ec2.ILaunchTemplate) {
    const ns = this.node.tryGetContext('ns') as string;

    const cluster = eks.Cluster.fromClusterAttributes(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: props.clusterName,
      clusterSecurityGroupId: props.clusterSecurityGroupId,
    });

    const nodeRole = new iam.Role(this, 'NodeInstanceRole', {
      roleName: `${ns}NodeInstanceRole`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonEC2ContainerRegistryReadOnly'
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
      ],
    });
    nodeRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'autoscaling:DescribeAutoScalingGroups',
          'autoscaling:DescribeAutoScalingInstances',
          'autoscaling:DescribeLaunchConfigurations',
          'autoscaling:DescribeTags',
          'autoscaling:CreateOrUpdateTags',
          'autoscaling:UpdateAutoScalingGroup',
          'autoscaling:TerminateInstanceInAutoScalingGroup',
          'ec2:DescribeLaunchTemplateVersions',
          'tag:GetResources',
        ],
        resources: ['*'],
      })
    );

    new eks.Nodegroup(this, 'NodeGroup', {
      nodegroupName: `default`,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      cluster,
      nodeRole,
      amiType: eks.NodegroupAmiType.AL2_ARM_64,
      instanceTypes: [
        ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
      ],
      launchTemplateSpec: {
        id: template.launchTemplateId!,
      },
      desiredSize: 2,
      minSize: 2,
      maxSize: 4,
    });
  }

  newSecurityGroup(props: IProps): ec2.ISecurityGroup {
    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'SecurityGroup',
      props.clusterSecurityGroupId
    );

    if (props.mskSecurityGroupId) {
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
    }

    if (props.rdsSecurityGroupId) {
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
    }

    return securityGroup;
  }

  newEc2Endpoint(vpc: ec2.IVpc, securityGroup: ec2.ISecurityGroup) {
    const endpoint = new ec2.InterfaceVpcEndpoint(this, 'Ec2VpcEndpoint', {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.EC2,
      subnets: {
        subnets: vpc.privateSubnets,
      },
      privateDnsEnabled: true,
    });

    endpoint.connections.allowFrom(
      ec2.Peer.securityGroupId(securityGroup.securityGroupId),
      ec2.Port.allTcp(),
      'EKS to EC2'
    );
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
