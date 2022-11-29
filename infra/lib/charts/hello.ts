import { Construct } from 'constructs';
import { Chart } from 'cdk8s';
import { KubeService, KubeDeployment, IntOrString } from './imports/k8s';

export class HelloChart extends Chart {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const label = { app: 'hello-k8s' };

    new KubeService(this, 'service', {
      spec: {
        type: 'LoadBalancer',
        ports: [{ port: 80, targetPort: IntOrString.fromNumber(8080) }],
        selector: label,
      },
    });

    new KubeDeployment(this, 'deployment', {
      spec: {
        replicas: 1,
        selector: {
          matchLabels: label,
        },
        template: {
          metadata: { labels: label },
          spec: {
            containers: [
              {
                name: 'hello-kubernetes',
                image: 'paulbouwer/hello-kubernetes:1.7',
                ports: [{ containerPort: 8080 }],
              },
            ],
          },
        },
      },
    });
  }
}
