import dotenv from 'dotenv';
dotenv.config();
import { db, } from '../config/awsDb.js'
import { v4 as uuidv4 } from 'uuid';
import { apiLogger } from "../logger/logger.js";



let extractorTable = 'Extractor'

// data insert into DynamoDB
/**
 * Function for data insert into DynamoDB.
 *.
 * @param {*} data - Input scrapedData.
 * @returns {Promise<Array>} insert  data from the DynamoDB.
 */
const insertOrUpdateData = async (data = {}) => {
    const param = {
        TableName: extractorTable,
        FilterExpression: "#url = :urlVal AND #client_id = :clientIdVal",
        ExpressionAttributeNames: {
            "#url": "url",
            "#client_id": "client_id"
        },
        ExpressionAttributeValues: {
            ":urlVal": data.passUrl.urls[0],
            ":clientIdVal": data.passUrl.client_id
        }
    };
    let { Items = [] } = await db.scan(param).promise();

    if (Object.keys(Items).length !== 0) {
        return { success: true }
    } else {
        let paramsArray = []
        let params
        let webPageUrlsData = data.scrapedData[0][data.passUrl.urls[0]].webpageUrls;

        let scrapData = {
            passUrl: data.passUrl,// value from data.passUrl,
            scrapedData: {
                [data.passUrl.urls[0]]: {
                    extractedData: data.scrapedData[0][data.passUrl.urls[0]].extractedData// value from data.scrapedData[0][data.passUrl.urls[0]].extractedData
                }
            },
            metadata: data.metadata// value from data.metadata
        };
        params = {
            PutRequest: {
                Item: {
                    id: uuidv4(),
                    parent_url: null,
                    url_cotent: scrapData,
                    url: data.passUrl.urls[0],
                    metaDataHash: data.scrapedData[0][data.passUrl.urls[0]].metaDataHash,
                    created_at: new Date().toJSON(),
                    updated_at: new Date().toJSON(),
                    client_id: data.passUrl.client_id
                }
            }
        }
        paramsArray.push(params)
        for (let i = 0; i < webPageUrlsData.length; i++) {
            let child_url = Object.keys(webPageUrlsData[i])[0];
            params = {
                PutRequest: {
                    Item: {
                        parent_url: data.passUrl.urls[0],
                        url: child_url,
                        id: uuidv4(),
                        url_cotent: webPageUrlsData[i],
                        metaDataHash: webPageUrlsData[i][child_url].metaDataHash,
                        created_at: new Date().toJSON(),
                        updated_at: new Date().toJSON(),
                        client_id: data.passUrl.client_id
                    }
                }
            }
            paramsArray.push(params)
        }
        try {
            /**
             In Amazon DynamoDB, the maximum limit for BatchWrite requests is 25 per BatchWrite operation.
             This means that you can include up to 25 individual write requests within a single BatchWrite operation.
            */
            const itemsPerArray = 25;
            const arrayOfArrays = [];

            for (let i = 0; i < paramsArray.length; i += itemsPerArray) {
                arrayOfArrays.push(paramsArray.slice(i, i + itemsPerArray));
            }
            for (let i in arrayOfArrays) {
                var paramss = {
                    RequestItems: {
                        'Extractor': arrayOfArrays[i]
                    }
                };
                await db.batchWrite(paramss).promise()
                apiLogger.info("data insert in dynamo db");
            }

            return { success: true }
        } catch (error) {
            apiLogger.error(JSON.stringify(error));
            return { success: false }
        }
    }

}
// Function for Get data By URL and Client_id from DynamoDB
/**
 * Function for Get data By URL and Client_id from DynamoDB.
 * @param {*} client_id - Input ID.
 * @param {*} url - Input URl.
 * @returns {Promise<Array>} Get data from the DynamoDB.
 */
async function getByUrlAndClientId(client_id, url) {
    const params = {
        TableName: extractorTable,
        FilterExpression: "#url = :urlVal AND #client_id = :clientIdVal",
        ExpressionAttributeNames: {
            "#url": "url",
            "#client_id": "client_id"
        },
        ExpressionAttributeValues: {
            ":urlVal": url,
            ":clientIdVal": client_id
        }
    };
    try {
        let webpageUrls = []
        let { Items = [] } = await db.scan(params).promise();
        if (Items.length > 0) {
            if (Items[0]['parent_url'] == null) {
                const param = {
                    TableName: extractorTable,
                    FilterExpression: "#parent_url = :parentUrlVal AND #client_id = :clientIdVal",
                    ExpressionAttributeNames: {
                        "#parent_url": "parent_url",
                        "#client_id": "client_id"
                    },
                    ExpressionAttributeValues: {
                        ":parentUrlVal": url,
                        ":clientIdVal": client_id
                    }
                };
                try {
                    let { Items = [] } = await db.scan(param).promise();
                    if (Items.length > 0) {
                        for (let i in Items) {
                            webpageUrls.push(Items[i])
                        }
                    }
                }
                catch (err) {
                    apiLogger.error(JSON.stringify(err));
                    return { success: false };
                }
                let childUrl = Object.keys(Items[0]['url_cotent']['scrapedData'])[0];
                let data = {
                    id:Items[0]['id'],
                    passUrl: Items[0]['url_cotent']['passUrl'],
                    scrapedData: { [childUrl]: { extractedData: Items[0]['url_cotent']['scrapedData'][childUrl]['extractedData'], metaDataHash: Items[0].metaDataHash, webpageUrls: webpageUrls } },
                    metadata: Items[0]['url_cotent']['metadata'],
                    created_at:Items[0]["created_at"],
                    updated_at:Items[0]["updated_at"]
                }
                apiLogger.info("get parent url  data .");
                return { success: true, data: data };
            }
            else {
                apiLogger.info("get child url data .");
                return { success: true, data: Items[0] };
            }

        }
        apiLogger.error("No Record Found With This URL and client_id");
        return { success: false, data: "No Record Found With This URL and client_id" };
    } catch (err) {
        apiLogger.error(JSON.stringify(err));
        return { success: false };
    }
}

// Function for Get data By ID from DynamoDB
/**
 * Function for Get data By ID from DynamoDB.
 * @param {*} id - Input ID.
 * @returns {Promise<Array>} Get data from the DynamoDB.
 */
async function getById(id) {
    const params = {
        TableName: extractorTable,
        Key: {
            id: id
        }
    }
    try {
        const { Item = {} } = await db.get(params).promise()
        if (Object.keys(Item).length !== 0) {
            apiLogger.info("Extraction data get by id.");
            return { success: true, data: Item }
        }
        else {
            apiLogger.error("Please Insert Valid ID");
            return { success: false, data: "Please Insert Valid ID" }
        }
    } catch (error) {
        apiLogger.error(JSON.stringify(error));
        return { success: false, data: error }
    }
}


// Function for update data from DynamoDB
/**
 * Function for update data from DynamoDB.
 * @param {*} data - Input updated scrapedData.
 * @returns {Promise<Array>} update data from the DynamoDB.
 */
async function updateData(data) {
    try {
        let client_id = data.passUrl.client_id
        let url = data.passUrl.urls[0]
        const params = {
            TableName: extractorTable,
            FilterExpression: "#url = :urlVal AND #client_id = :clientIdVal",
            ExpressionAttributeNames: {
                "#url": "url",
                "#client_id": "client_id"
            },
            ExpressionAttributeValues: {
                ":urlVal": url,
                ":clientIdVal": client_id
            }
        };
        const { Items = {} } = await db.scan(params).promise()
        if (Object.keys(Items).length !== 0) {
            if (Items[0]['parent_url'] == null) {
                let scrapData = {
                    passUrl: data.passUrl,// value from data.passUrl,
                    scrapedData: {
                        [data.passUrl.urls[0]]: {
                            extractedData: data.scrapedData[0][data.passUrl.urls[0]].extractedData// value from data.scrapedData[0][data.passUrl.urls[0]].extractedData
                        }
                    },
                    metadata: data.metadata// value from data.metadata
                };
                const params = {
                    TableName: extractorTable,
                    Item: {
                        id: Items[0]['id'],
                        url: Items[0]['url'],
                        parent_url: Items[0]['parent_url'],
                        url_cotent: scrapData,
                        created_at: Items[0]['created_at'],
                        metaDataHash: data.scrapedData[0][Items[0]['url']].metaDataHash,
                        updated_at: new Date().toJSON(),
                        client_id: client_id
                    }
                }
                await db.put(params).promise()

                if (data.scrapedData[0][url].webpageUrls.length != 0) {
                    try {
                        let paramsArray = []
                        let dataWebpageUrls = data.scrapedData[0][url].webpageUrls
                        for (let i in dataWebpageUrls) {
                            let urls = Object.keys(dataWebpageUrls[i])[0];
                            const params = {
                                TableName: extractorTable,
                                FilterExpression: "#url = :urlVal AND #client_id = :clientIdVal",
                                ExpressionAttributeNames: {
                                    "#url": "url",
                                    "#client_id": "client_id"
                                },
                                ExpressionAttributeValues: {
                                    ":urlVal": urls,
                                    ":clientIdVal": client_id
                                }
                            };
                            const { Items = {} } = await db.scan(params).promise()
                            if (Object.keys(Items).length !== 0) {
                                let params = {
                                    PutRequest: {
                                        Item: {
                                            parent_url: Items[0].parent_url,
                                            url: urls,
                                            id: Items[0].id,
                                            url_cotent: dataWebpageUrls[i],
                                            metaDataHash: dataWebpageUrls[i][urls].metaDataHash,
                                            created_at: Items[0].created_at,
                                            updated_at: new Date().toJSON(),
                                            client_id: client_id
                                        }
                                    }
                                }
                                paramsArray.push(params)
                            }
                        }
                        try {
                            /**
                            In Amazon DynamoDB, the maximum limit for BatchWrite requests is 25 per BatchWrite operation.
                            This means that you can include up to 25 individual write requests within a single BatchWrite operation.
                            */
                            const itemsPerArray = 25;
                            const arrayOfArrays = [];

                            for (let i = 0; i < paramsArray.length; i += itemsPerArray) {
                                arrayOfArrays.push(paramsArray.slice(i, i + itemsPerArray));
                            }
                            for (let i in arrayOfArrays) {
                                var paramss = {
                                    RequestItems: {
                                        'Extractor': arrayOfArrays[i]
                                    }
                                };
                                await db.batchWrite(paramss).promise()
                            }
                            apiLogger.info("Child Url Extraction Data Update.");
                            return { success: true }
                        } catch (error) {
                            apiLogger.error(JSON.stringify(error));
                            return { success: false }
                        }
                    }
                    catch (err) {
                        apiLogger.error(JSON.stringify(err));
                        return { success: false };
                    }
                } else {
                    apiLogger.info("Parent Url Extraction Data Update.");
                    return { success: true }
                }
            }
            else {
                return { success: false, data: 'this is Child Url' }
            }

        }
        else {
            apiLogger.error("Please Insert Valid Url And Client ID");
            return { success: false, data: "Please Insert Valid Url And Client ID" }
        }
    } catch (error) {
        apiLogger.error(JSON.stringify(error));
        return { success: false }
    }
}

export {
    insertOrUpdateData,
    getById,
    getByUrlAndClientId,
    updateData
}
