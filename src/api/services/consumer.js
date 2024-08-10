import amqp from 'amqplib';
import { Client } from '@elastic/elasticsearch';

const RABBITMQ_URL = 'amqp://localhost'; // Adjust to your RabbitMQ URL
const ELASTICSEARCH_URL = 'http://localhost:9200'; // Adjust to your Elasticsearch URL

const esClient = new Client({ node: ELASTICSEARCH_URL });

async function consumeMessages(queue) {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(queue, { durable: true });

    console.log(`Waiting for messages in ${queue}. To exit press CTRL+C`);

    channel.consume(queue, async (msg) => {
        if (msg !== null) {
            const messageContent = JSON.parse(msg.content.toString());

            try {
                await esClient.index({
                    index: 'plans', // Index name in Elasticsearch
                    body: messageContent,
                });
                console.log(`Message consumed and added to Elasticsearch: ${msg.content.toString()}`);
                channel.ack(msg);
            } catch (err) {
                console.error('Error saving to Elasticsearch', err);
                channel.nack(msg);
            }
        }
    });
}

consumeMessages('planQueue');