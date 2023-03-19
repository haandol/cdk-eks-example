#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EksClusterStack } from '../lib/stacks/eks-cluster-stack';
import { EksNodeGroupStack } from '../lib/stacks/eks-nodegroup-stack';
import { VpcStack } from '../lib/stacks/vpc-stack';
import { Config } from '../config/loader';

const app = new cdk.App({
  context: {
    ns: Config.app.ns,
    stage: Config.app.stage,
  },
});

const vpcStack = new VpcStack(app, `${Config.app.ns}VpcStack`, {
  vpcId: Config.vpc.id,
  env: {
    account: Config.aws.account,
    region: Config.aws.region,
  },
});

const clusterStack = new EksClusterStack(
  app,
  `${Config.app.ns}EksClusterStack`,
  {
    vpc: vpcStack.vpc,
    endpointPublicCidrs: Config.vpc.endpointPublicCidrs,
    env: {
      account: Config.aws.account,
      region: Config.aws.region,
    },
  }
);
clusterStack.addDependency(vpcStack);

const nodegroupStack = new EksNodeGroupStack(
  app,
  `${Config.app.ns}EksNodeGroupStack`,
  {
    vpc: vpcStack.vpc,
    clusterName: clusterStack.cluster.clusterName,
    clusterSecurityGroupId: clusterStack.cluster.clusterSecurityGroupId,
    mskSecurityGroupId: Config.securityGroups.msk,
    rdsSecurityGroupId: Config.securityGroups.rds,
    env: {
      account: Config.aws.account,
      region: Config.aws.region,
    },
  }
);
nodegroupStack.addDependency(clusterStack);

const tags = cdk.Tags.of(app);
tags.add('namespace', Config.app.ns);
tags.add('stage', Config.app.stage);
