# CDK EKS Example

# Prerequisites

- git
- awscli
- Nodejs 16.x
- AWS Account and locally configured AWS credential

# Installation

## Setup awscli

```bash
$ aws configure
AWS Access Key ID [********************]:
AWS Secret Access Key [********************]:
Default region name [us-east-1]:
Default output format [json]:
```

## Configuration

open [**infra/env/dev.env**](/infra/env/dev.env) and fill the blow fields

- `VPC_ID`: vpc id
- `AWS_ACCOUNT_ID`: 12 digit account id
- `AWS_REGION`: e.g. ap-northeast-2

and copy `env/dev.env` file to project root as `.env`

```bash
$ cd infra
$ cp env/dev.env .env
```

## Install dependencies

```bash
$ cd infra
$ npm i -g aws-cdk@2.54
$ npm i
```

## Provision

```bash
$ cdk bootstrap
$ cdk deploy --require-approval never
```
