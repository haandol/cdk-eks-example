export interface IConfig {
  Ns: string;
  Stage: string;
  AWS: {
    Account: string;
    Region: string;
  };
  VpcId: string;
  IsProd: () => boolean;
}
