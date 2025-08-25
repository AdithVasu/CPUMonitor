// test-influx.js
// Run this to test your InfluxDB Cloud connection
// node test-influx.js
require('dotenv').config();
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

const INFLUX_URL = process.env.INFLUX_URL;
const INFLUX_TOKEN = process.env.INFLUX_TOKEN;
const INFLUX_ORG = process.env.INFLUX_ORG;
const INFLUX_BUCKET = process.env.INFLUX_BUCKET;

console.log('Testing InfluxDB Cloud Connection...');
console.log(`URL: ${INFLUX_URL}`);
console.log(`Org: ${INFLUX_ORG}`);
console.log(`Bucket: ${INFLUX_BUCKET}`);
console.log(`Token: ${INFLUX_TOKEN ? '***hidden***' : 'MISSING!'}`);
console.log('---');

async function testConnection() {
  try {
    // Initialize InfluxDB client
    const influxDB = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
    const writeClient = influxDB.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ns');
    const queryClient = influxDB.getQueryApi(INFLUX_ORG);

    console.log('✓ InfluxDB client initialized');

    // Test write - send a test data point
    const testPoint = new Point('test_metric')
      .floatField('value', Math.random() * 100)
      .timestamp(new Date());

    writeClient.writePoint(testPoint);
    await writeClient.flush();
    console.log('✓ Test data point written successfully');

    // Wait a moment for data to be available
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test query - try to read back data
    const fluxQuery = `
      from(bucket: "${INFLUX_BUCKET}")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "test_metric")
        |> last()
    `;

    let dataFound = false;
    await new Promise((resolve, reject) => {
      queryClient.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          console.log('✓ Test query successful - found data:', {
            measurement: o._measurement,
            field: o._field,
            value: o._value,
            time: o._time
          });
          dataFound = true;
        },
        error(error) {
          console.error('✗ Query error:', error);
          reject(error);
        },
        complete() {
          if (!dataFound) {
            console.log('⚠ Query completed but no data found (this might be normal for new setup)');
          }
          resolve();
        }
      });
    });

    await writeClient.close();
    console.log('---');
    console.log('🎉 InfluxDB Cloud connection test SUCCESSFUL!');
    console.log('Your backend should work perfectly with these settings.');

  } catch (error) {
    console.error('---');
    console.error('❌ Connection test FAILED:', error.message);
    
    if (error.message.includes('unauthorized')) {
      console.error('💡 This usually means your INFLUX_TOKEN is incorrect');
    } else if (error.message.includes('not found')) {
      console.error('💡 This usually means your INFLUX_ORG or INFLUX_BUCKET is incorrect');
    } else if (error.message.includes('ENOTFOUND')) {
      console.error('💡 This usually means your INFLUX_URL is incorrect');
    }
    
    console.error('💡 Double-check your .env file values against InfluxDB Cloud dashboard');
    process.exit(1);
  }
}

testConnection();