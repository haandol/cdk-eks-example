#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EksClusterStack } from '../lib/stacks/eks-cluster-stack';
import { EksNodeGroupStack } from '../lib/stacks/eks-nodegroup-stack';
import { VpcStack } from '../lib/stacks/vpc-stack';
import { Config } from '../lib/configs/loader';

const app = new cdk.App({
  context: {
    ns: Config.Ns,
  },
});

const vpcStack = new VpcStack(app, `${Config.Ns}VpcStack`, {
  vpcId: Config.VpcId,
  env: {
    account: Config.AWS.Account,
    region: Config.AWS.Region,
  },
});

const clusterStack = new EksClusterStack(app, `${Config.Ns}EksClusterStack`, {
  vpc: vpcStack.vpc,
  env: {
    account: Config.AWS.Account,
    region: Config.AWS.Region,
  },
});
clusterStack.addDependency(vpcStack);

const nodegroupStack = new EksNodeGroupStack(
  app,
  `${Config.Ns}EksNodeGroupStack`,
  {
    vpc: vpcStack.vpc,
    clusterName: clusterStack.cluster.clusterName,
    clusterSecurityGroupId: clusterStack.cluster.clusterSecurityGroupId,
    mskSecurityGroupId: Config.MskSecurityGroupId,
    rdsSecurityGroupId: Config.RdsSecurityGroupId,
    env: {
      account: Config.AWS.Account,
      region: Config.AWS.Region,
    },
  }
);
nodegroupStack.addDependency(clusterStack);

const tags = cdk.Tags.of(app);
tags.add('namespace', Config.Ns);
tags.add('stage', Config.Stage);
