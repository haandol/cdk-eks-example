#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EksStack } from '../lib/stacks/eks-stack';
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

const eksStack = new EksStack(app, `${Config.Ns}EksStack`, {
  vpc: vpcStack.vpc,
  env: {
    account: Config.AWS.Account,
    region: Config.AWS.Region,
  },
});
eksStack.addDependency(vpcStack);
