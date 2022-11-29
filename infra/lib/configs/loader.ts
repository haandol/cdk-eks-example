import * as path from 'path';
import * as joi from 'joi';
import * as dotenv from 'dotenv';
import { IConfig } from './interface';
import { VpcValidator } from './validators';

dotenv.config({
  path: path.resolve(__dirname, '..', '..', '.env'),
});

console.log('process.env', process.env);

const schema = joi
  .object({
    NS: joi.string().required(),
    STAGE: joi.string().required(),
    AWS_ACCOUNT_ID: joi.number().required(),
    AWS_REGION: joi.string().required(),
    VPC_ID: joi.string().custom(VpcValidator).required(),
  })
  .unknown();

const { value: envVars, error } = schema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const Config: IConfig = {
  Ns: `${envVars.NS}${envVars.STAGE}`,
  Stage: envVars.STAGE,
  AWS: {
    Account: `${envVars.AWS_ACCOUNT_ID}`,
    Region: envVars.AWS_REGION,
  },
  VpcId: envVars.VPC_ID,
  IsProd: () => Config.Stage === 'Prod',
};
