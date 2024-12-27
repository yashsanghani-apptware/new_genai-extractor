import dotenv from 'dotenv';
dotenv.config();
import AWS from 'aws-sdk'
AWS.config.update({
    region: "us-east-1",
    // eslint-disable-next-line no-undef
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    // eslint-disable-next-line no-undef
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
})
const db = new AWS.DynamoDB.DocumentClient()

export {
    db,
}
