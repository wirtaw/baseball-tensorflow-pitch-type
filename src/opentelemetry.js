'use strict';
const path = require('node:path');

const grpc = require('@grpc/grpc-js');

const config = require(path.join(__dirname, '../config'));

const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { BasicTracerProvider, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const {
  SocketIoInstrumentation,
} = require('@opentelemetry/instrumentation-socket.io');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const metadata = new grpc.Metadata();

metadata.set('api-key', config.MAIN.NEW_RELIC_API_KEY);

const collectorOptions = {
  metadata,
};

const provider = new BasicTracerProvider();
const exporter = new OTLPTraceExporter(collectorOptions);
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

provider.register();
registerInstrumentations({
  instrumentations: [new SocketIoInstrumentation()],
});
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => provider.shutdown().catch(console.error));
});
