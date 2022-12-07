import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import { KubectlV23Layer } from '@aws-cdk/lambda-layer-kubectl-v23';

interface IProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  mskSecurityGroupId: string;
  rdsSecurityGroupId: string;
}

export class EksStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id, props);

    const ns = this.node.tryGetContext('ns') as string;

    const securityGroup = this.newSecurityGroup(props);

    const cluster = this.newEc2Cluster(props, securityGroup);
    const launchTemplate = this.newLaunchTemplate(securityGroup);

    const nodeRole = new iam.Role(this, 'NodeRole', {
      roleName: `${ns}NodeRole`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonEC2ContainerRegistryReadOnly'
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
      ],
    });
    cluster.addNodegroupCapacity('CustomNodeGroup', {
      nodegroupName: ns.toLowerCase(),
      desiredSize: 2,
      minSize: 2,
      maxSize: 4,
      nodeRole,
      launchTemplateSpec: {
        id: launchTemplate.launchTemplateId!,
        version: launchTemplate.versionNumber!,
      },
    });

    this.newEcrEndpoint(cluster, securityGroup);
  }

  newEc2Cluster(props: IProps, securityGroup: ec2.ISecurityGroup): eks.Cluster {
    const ns = this.node.tryGetContext('ns') as string;

    const role = new iam.Role(this, 'ClusterRole', {
      roleName: `${ns}ClusterRole`,
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
      ],
    });
    return new eks.Cluster(this, 'Cluster', {
      clusterName: ns.toLowerCase(),
      vpc: props.vpc,
      role,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      version: eks.KubernetesVersion.V1_23,
      outputClusterName: true,
      outputConfigCommand: true,
      kubectlLayer: new KubectlV23Layer(this, 'kubectlV23Layer'),
      defaultCapacity: 0,
      securityGroup,
    });
  }

  newSecurityGroup(props: IProps): ec2.SecurityGroup {
    const ns = this.node.tryGetContext('ns') as string;

    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      securityGroupName: `${ns}TaskSecurityGroup`,
      vpc: props.vpc,
    });
    const mskSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      `MskSecurityGroup`,
      props.mskSecurityGroupId
    );
    mskSecurityGroup.addIngressRule(securityGroup, ec2.Port.tcp(9094));

    const rdsSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      `RdsSecurityGroup`,
      props.rdsSecurityGroupId
    );
    rdsSecurityGroup.addIngressRule(securityGroup, ec2.Port.tcp(3306));

    return securityGroup;
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
      machineImage: new eks.EksOptimizedImage({
        kubernetesVersion: eks.KubernetesVersion.V1_23.version,
      }),
      securityGroup,
      detailedMonitoring: true,
    });
  }

  newEcrEndpoint(cluster: eks.Cluster, securityGroup: ec2.ISecurityGroup) {
    const endpoint = new ec2.InterfaceVpcEndpoint(this, 'EcrVpcEndpoint', {
      vpc: cluster.vpc,
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      subnets: {
        subnets: cluster.vpc.privateSubnets,
      },
      privateDnsEnabled: true,
    });

    endpoint.connections.allowFrom(
      ec2.Peer.securityGroupId(securityGroup.securityGroupId),
      ec2.Port.tcp(443),
      'EKS to ECR'
    );
  }
}
