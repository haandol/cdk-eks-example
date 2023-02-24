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
  EndpointPublicCidrs: string[];
  IsProd: () => boolean;
}
