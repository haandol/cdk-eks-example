import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import { KubectlV23Layer } from '@aws-cdk/lambda-layer-kubectl-v23';

interface IProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class EksStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id, props);

    const ns = this.node.tryGetContext('ns') as string;

    const cluster = new eks.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      clusterName: ns.toLowerCase(),
      version: eks.KubernetesVersion.V1_23,
      outputClusterName: true,
      outputConfigCommand: true,
      outputMastersRoleArn: true,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      kubectlLayer: new KubectlV23Layer(this, 'kubectlV23Layer'),
      defaultCapacity: 0,
      defaultCapacityType: eks.DefaultCapacityType.EC2,
      albController: {
        version: eks.AlbControllerVersion.V2_4_1,
      },
    });

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
    });
    cluster.addNodegroupCapacity('CustomNodeGroup', {
      launchTemplateSpec: {
        id: launchTemplate.launchTemplateId!,
        version: launchTemplate.versionNumber!,
      },
    });
  }
}
