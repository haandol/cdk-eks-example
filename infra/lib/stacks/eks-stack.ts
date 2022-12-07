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

    const cluster = new eks.Cluster(this, 'Cluster', {
      clusterName: ns.toLowerCase(),
      vpc: props.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      version: eks.KubernetesVersion.V1_23,
      outputClusterName: true,
      outputConfigCommand: true,
      kubectlLayer: new KubectlV23Layer(this, 'kubectlV23Layer'),
      defaultCapacity: 0,
    });

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

    const launchTemplate = new ec2.LaunchTemplate(this, 'LaunchTemplate', {
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

    cluster.addNodegroupCapacity('CustomNodeGroup', {
      nodegroupName: ns.toLowerCase(),
      desiredSize: 2,
      minSize: 2,
      maxSize: 4,
      launchTemplateSpec: {
        id: launchTemplate.launchTemplateId!,
        version: launchTemplate.versionNumber!,
      },
    });
  }
}
