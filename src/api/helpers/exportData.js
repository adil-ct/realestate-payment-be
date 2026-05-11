import fs from 'fs';
import { stringify } from 'csv-stringify';
import json2xls from 'json2xls';
import logger from '../config/logger.js';
import appRootPath from 'app-root-path';
import { AsyncParser } from '@json2csv/node';

export const exportData = async (data) => {
  try {
    logger.info('Inside exportData helper');

    // Creating folder to store data file
    await fs.mkdirSync(
      `${appRootPath}/data-to-send`,
      { recursive: true },
      (err) => {
        if (err) return { error: err.message };
      }
    );

    // For creating xlsx file
    if (data.type === 'toXls') {
      const xlsData = json2xls(data.resultData);
      await fs.writeFileSync(
        `${appRootPath}/data-to-send/${data.fileName}.xlsx`,
        xlsData,
        'binary'
      );
    }

    // For creating csv file
    else if (data.type === 'toCsv') {
      const parser = new AsyncParser();
      const csvData = await parser.parse(data.resultData).promise();
      await fs.writeFileSync(
        `${appRootPath}/data-to-send/${data.fileName}.csv`,
        csvData,
        'utf-8'
      );
    }

    return true;
  } catch (err) {
    logger.error(err.message);
    return { error: err.message };
  }
};
