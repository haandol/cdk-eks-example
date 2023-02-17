export interface IConfig {
  Ns: string;
  Stage: string;
  AWS: {
    Account: string;
    Region: string;
  };
  VpcId: string;
  MskSecurityGroupId?: string;
  RdsSecurityGroupId?: string;
  IsProd: () => boolean;
}
