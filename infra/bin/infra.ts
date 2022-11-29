#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EksStack } from '../lib/stacks/eks-stack';
import { Config } from '../lib/configs/loader';

const app = new cdk.App();

new EksStack(app, `${Config.Ns}EksStack`, {});
