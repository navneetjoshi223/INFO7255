import { Validator } from "jsonschema";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import md5 from "md5";
import { fileURLToPath } from "url";

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const validator = new Validator();

// Read the JSON schema file synchronously
const schemaPath = resolve(__dirname, "./schema.json");
const schemaData = readFileSync(schemaPath, "utf-8");
const jsonSchema = JSON.parse(schemaData);

const validate = (reqBody) => {
  if (validator.validate(reqBody, jsonSchema).errors.length < 1) {
    return true;
  }
  return false;
};

const md5hash = (body) => {
  return md5(body);
};

export { validate, md5hash };
