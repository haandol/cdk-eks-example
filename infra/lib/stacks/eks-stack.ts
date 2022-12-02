import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';

interface IProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class EksStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id, props);

    const ns = this.node.tryGetContext('ns');

    const mastersRole = new iam.Role(this, 'cluster-master-role', {
      assumedBy: new iam.AccountPrincipal(cdk.Stack.of(this).account),
    });

    const podExecutionRole = new iam.Role(this, 'PodExecutionRole', {
      assumedBy: new iam.ServicePrincipal('eks-fargate-pods.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonEKSFargatePodExecutionRolePolicy'
        ),
      ],
    });

    const cluster = new eks.FargateCluster(this, 'FargateCluster', {
      version: eks.KubernetesVersion.V1_23,
      mastersRole,
      clusterName: `${ns}fargate-cluster`,
      outputClusterName: true,
      outputConfigCommand: true,
      outputMastersRoleArn: true,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      defaultProfile: {
        fargateProfileName: `${ns}fargate-profile`,
        podExecutionRole,
        selectors: [{ namespace: 'default' }, { namespace: 'kube-system' }],
      },
      vpc: props.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });
  }
}
