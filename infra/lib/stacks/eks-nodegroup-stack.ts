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

    const securityGroup = this.getClusterSecurityGroup(props);
    const nodeGroup = this.newNodeGroup(props);

    this.newEcrApiEndpoint(props.vpc, securityGroup);
    this.newEcrDockerEndpoint(props.vpc, securityGroup);
    this.newS3Endpoint(props.vpc);
  }

  newNodeGroup(props: IProps): eks.Nodegroup {
    const ns = this.node.tryGetContext('ns') as string;

    const nodeRole = new iam.Role(this, 'NodeInstanceRole', {
      roleName: `${ns}NodeInstanceRole`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonEC2ContainerRegistryReadOnly'
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore'
        ),
      ],
    });

    const cluster = eks.Cluster.fromClusterAttributes(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: props.clusterName,
      clusterSecurityGroupId: props.clusterSecurityGroupId,
    });

    const nodeGroup = new eks.Nodegroup(this, 'NodeGroup', {
      nodegroupName: ns.toLowerCase(),
      instanceTypes: [new ec2.InstanceType('t3.medium')],
      cluster,
      nodeRole,
      maxSize: 4,
      diskSize: 128,
    });

    return nodeGroup;
  }

  getClusterSecurityGroup(props: IProps): ec2.ISecurityGroup {
    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'SecurityGroup',
      props.clusterSecurityGroupId
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
