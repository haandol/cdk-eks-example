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

open [**infra/config/dev.toml**](/infra/config/dev.toml) and fill the empty fields
and copy `config/dev.toml` file to project root as `.toml`

```bash
$ cd infra
$ cp config/dev.toml .toml
```

## Install dependencies

```bash
$ cd infra
$ npm i -g aws-cdk@2.69
$ npm i
```

## Provision

```bash
$ cdk bootstrap
$ cdk deploy "*" --require-approval never
```
