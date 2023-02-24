import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import { KubectlV24Layer } from '@aws-cdk/lambda-layer-kubectl-v24';

interface IProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  endpointPublicCidr: string;
}

export class EksClusterStack extends cdk.Stack {
  public readonly cluster: eks.ICluster;

  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id, props);

    this.cluster = this.newEc2Cluster(props);
  }

  newEc2Cluster(props: IProps): eks.Cluster {
    const ns = this.node.tryGetContext('ns') as string;

    const role = new iam.Role(this, 'ClusterRole', {
      roleName: `${ns}ClusterRole`,
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonEKSVPCResourceController'
        ),
      ],
    });
    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      securityGroupName: `${ns}ClusterSecurityGroup`,
      vpc: props.vpc,
    });
    securityGroup.connections.allowInternally(
      ec2.Port.allTraffic(),
      'All traffic for self'
    );
    const cluster = new eks.Cluster(this, 'Cluster', {
      clusterName: ns.toLowerCase(),
      vpc: props.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE.onlyFrom(
        props.endpointPublicCidr
      ),
      version: eks.KubernetesVersion.V1_24,
      outputClusterName: true,
      outputConfigCommand: true,
      kubectlLayer: new KubectlV24Layer(this, 'kubectlV24Layer'),
      defaultCapacity: 0,
      securityGroup,
      role,
    });
    return cluster;
  }
}
