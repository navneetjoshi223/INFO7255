import { findPlan, addPlan, deleteByPlanId, findAllPlans, updatePlanById } from "../services/redis.client.js";
import { validate, md5hash } from "../utils/schemaValidation.js";
import {
  BadRequestError,
  InternalServerError,
  ResourceNotFoundError,
  PreConditionFailedError,
  conflictHandler,
  createHandler,
  noContentHandler,
  notModifiedHandler,
  successHandler,
} from "../utils/error.util.js";
import logger from "../../configs/logger.config.js";
import amqp from 'amqplib';
import { fetchAllDocuments } from "../services/elastic.service.js";

const RABBITMQ_URL = 'amqp://localhost';
const RABBITMQ_QUEUE_NAME = 'planQueue';

async function publishToQueue(queue, message) {
  const connection = await amqp.connect(RABBITMQ_URL);
  if(connection) {
    console.log('Connected!!!');
  }
  const channel = await connection.createChannel();
  await channel.assertQueue(queue, { durable: true });
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
  console.log(`Message sent to queue ${queue}`);
}

const getPlan = async (req, res, next) => {
  const { protocol, method, hostname, originalUrl, params } = req;
  const headers = { ...req.headers };
  const metaData = { protocol, method, hostname, originalUrl, headers, params };
  logger.info(
    `Requesting ${method} ${protocol}://${hostname}${originalUrl}`,
    metaData
  );
  try {
    const { planId } = params;
    if (planId === null || planId === "" || planId === "{}") {
      throw new BadRequestError(`Invalid planId`);
    }
    const value = await findPlan(planId);
    if (value.objectId === planId) {
      // conditional read based on `if-none-match` header
      if (
        req.headers["if-none-match"] &&
        value.ETag === req.headers["if-none-match"]
      ) {
        res.setHeader("ETag", value.ETag);
        const data = {
          message: "Plan has not changed",
          plan: JSON.parse(value.plan),
        };
        notModifiedHandler(res, data);
      } else {
        res.setHeader("ETag", value.ETag);
        const data = {
          message: "Plan has changed",
          plan: JSON.parse(value.plan),
        };
        successHandler(res, data);
      }
    } else {
      throw new ResourceNotFoundError(`Plan not found`);
    }
  } catch (err) {
    next(err);
  }
};

const getAllPlans = async (req, res, next) => {
  const { protocol, method, hostname, originalUrl, headers } = req;
  const metaData = { protocol, method, hostname, originalUrl, headers };
  logger.info(
    `Requesting ${method} ${protocol}://${hostname}${originalUrl}`,
    metaData
  );

  try {
    // Step 1: Publish a message to RabbitMQ
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();
    const messageContent = { operation: 'FETCH_ALL_PLANS' }; // Customize your message content if needed
    await channel.sendToQueue(RABBITMQ_QUEUE_NAME, Buffer.from(JSON.stringify(messageContent)));
    logger.info('Published message to RabbitMQ for fetching all plans');
    
    // Close channel and connection
    await channel.close();
    await connection.close();

    const plans = await findAllPlans();
    // Step 2: Fetch plans from Elasticsearch
    //const plans = await fetchAllDocuments(); // Assume this function fetches all documents from Elasticsearch

    if (plans.length === 0) {
      return res.status(200).json({ message: 'No plans found', plans: [] });
    }

    res.status(200).json({ message: 'Plans retrieved successfully', plans });
  } catch (err) {
    logger.error('Error retrieving plans:', err);
    next(err);
  }
};

const savePlan = async (req, res, next) => {
  const { protocol, method, hostname, originalUrl, params } = req;
  const headers = { ...req.headers };
  const metaData = { protocol, method, hostname, originalUrl, headers, params };
  logger.info(`Requesting ${method} ${protocol}://${hostname}${originalUrl}`, metaData);

  try {
      if (validate(req.body)) {
          const value = await findPlan(req.body.objectId);
          if (value) {
              res.setHeader("ETag", value.ETag);
              const data = { message: "Item already exists" };
              conflictHandler(res, data);
          } else {
              const newPlan = await addPlan(req.body);
              const { ETag } = newPlan;
              res.setHeader("ETag", ETag);
              const data = {
                  message: "Item added",
                  ETag,
              };
              
              // Publish to RabbitMQ
              await publishToQueue('planQueue', req.body);
              
              createHandler(res, data);
          }
      } else {
          throw new BadRequestError(`Item is not valid`);
      }
  } catch (err) {
      next(err);
  }
};

const deletePlan = async (req, res, next) => {
  const { protocol, method, hostname, originalUrl, params } = req;
  const headers = { ...req.headers };
  const metaData = { protocol, method, hostname, originalUrl, headers, params };
  logger.info(
    `Requesting ${method} ${protocol}://${hostname}${originalUrl}`,
    metaData
  );
  try {
    const { planId } = params;
    if (planId === null || planId === "" || planId === "{}") {
      throw new BadRequestError(`Invalid planId`);
    }
    const value = await findPlan(planId);
    if (value !== false && value.objectId === planId) {
      // conditional delete based on `if-match` header
      const data = {
        plan: JSON.parse(value.plan),
      };
      if (req.headers["if-match"]) {
        // if ETag matches on conditional delete
        if (value.ETag === req.headers["if-match"]) {
          logger.info(`Item found`, JSON.parse(value.plan));
          if (deleteByPlanId(planId)) {
            logger.info(`Item deleted`, JSON.parse(value.plan));
            noContentHandler(res, data);
          } else {
            throw new InternalServerError(`Item not deleted`);
          }
        } else {
          throw new PreConditionFailedError(
            `ETag provided in header is not valid`
          );
        }
      } else if (deleteByPlanId(planId)) {
        logger.info(`Item deleted`, JSON.parse(value.plan));
        noContentHandler(res, data);
      } else {
        throw new InternalServerError(`Item not deleted`);
      }
    } else {
      throw new ResourceNotFoundError(`Plan not found`);
    }
  } catch (err) {
    next(err);
  }
};

const updatePlan = async (req, res, next) => {
  const { protocol, method, hostname, originalUrl, params } = req;
  const headers = { ...req.headers };
  const metaData = { protocol, method, hostname, originalUrl, headers, params };
  logger.info(
    `Requesting ${method} ${protocol}://${hostname}${originalUrl}`,
    metaData
  );

  try {
    const { planId } = params;
    if (!planId || planId === "{}") {
      throw new BadRequestError(`Invalid planId`);
    }

    if (!validate(req.body)) {
      throw new BadRequestError(`Invalid update data`);
    }

    const existingPlan = await findPlan(planId);
    if (!existingPlan || existingPlan.objectId !== planId) {
      throw new ResourceNotFoundError(`Plan not found`);
    }

    // Conditional update based on `if-match` header
    if (req.headers["if-match"]) {
      if (existingPlan.ETag !== req.headers["if-match"]) {
        throw new PreConditionFailedError(`ETag provided in header is not valid`);
      }
    }

    // Merge the existing plan with the new data
    const parsedExistingPlan = JSON.parse(existingPlan.plan);
    const updatedPlan = {
      ...parsedExistingPlan,
      ...req.body,
      linkedPlanServices: [
        ...parsedExistingPlan.linkedPlanServices,
        ...req.body.linkedPlanServices
      ]
    };

    const result = await updatePlanById(planId, updatedPlan);
    if (result) {
      res.setHeader("ETag", result.ETag);
      const data = {
        message: "Plan updated successfully",
        plan: result,
      };
      successHandler(res, data);
    } else {
      throw new InternalServerError(`Plan update failed`);
    }
  } catch (err) {
    next(err);
  }
};



// const updatePlan = async (req, res, next) => {
//   const { protocol, method, hostname, originalUrl, params } = req;
//   const headers = { ...req.headers };
//   const metaData = { protocol, method, hostname, originalUrl, headers, params };
//   logger.info(
//     `Requesting ${method} ${protocol}://${hostname}${originalUrl}`,
//     metaData
//   );

//   try {
//     const { planId } = params;
//     if (planId === null || planId === "" || planId === "{}") {
//       throw new BadRequestError(`Invalid planId`);
//     }

//     if (!validate(req.body)) {
//       throw new BadRequestError(`Invalid update data`);
//     }

//     const existingPlan = await findPlan(planId);
//     if (!existingPlan || existingPlan.objectId !== planId) {
//       throw new ResourceNotFoundError(`Plan not found`);
//     }

//     // Conditional update based on `if-match` header
//     if (req.headers["if-match"]) {
//       if (existingPlan.ETag !== req.headers["if-match"]) {
//         throw new PreConditionFailedError(`ETag provided in header is not valid`);
//       }
//     }

//     // Merge the existing plan with the new data
//     const updatedPlan = { ...JSON.parse(existingPlan.plan), ...req.body };
//     const result = await updatePlanById(planId, updatedPlan);
//     if (result) {
//       const newETag = generateETag(updatedPlan);
//       res.setHeader("ETag", newETag);
//       const data = {
//         message: "Plan updated successfully",
//         plan: updatedPlan,
//       };
//       successHandler(res, data);
//     } else {
//       throw new InternalServerError(`Plan update failed`);
//     }
//   } catch (err) {
//     next(err);
//   }
// };


export { getPlan, savePlan, deletePlan, getAllPlans, updatePlan };
