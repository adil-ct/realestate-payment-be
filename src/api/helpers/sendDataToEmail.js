import clientMail from '@sendgrid/mail';
import appRootPath from 'app-root-path';
import fs from 'fs';

import logger from '../config/logger.js';
import config from '../config/config.js';

clientMail.setApiKey(await config.sendgridApiKey);

export const sendDatafileEmail = async (userEmail, type, fileName) => {
  try {
    logger.info('Inside sendDatafileEmail helper');
    const subject = fileName || 'Details of plarform transactions';
    const text = 'Request data attached below';

    const fileType = type === 'toCsv' ? 'csv' : 'xlsx';
    const attachmentPath = `${appRootPath}/data-to-send/${fileName}.${fileType}`;
    const attachment = fs.readFileSync(attachmentPath).toString('base64');

    const msg = {
      to: userEmail,
      from: await config.sendEmailFrom,
      subject,
      text,
      attachments: [
        {
          content: attachment,
          filename: `${fileName}.${fileType}`,
          type: `application/${fileType}`,
          disposition: 'attachment',
        },
      ],
    };

    clientMail
      .send(msg)
      .then(() => {
        fs.unlink(attachmentPath, () => {
          logger.info(`${fileType} file sent to mail successfully.`);
          logger.info(`Deleting generated ${fileType} file.`);
        });
      })
      .catch((err) => {
        fs.unlink(attachmentPath, () => {
          logger.info(
            `Error in sending mail! Deleting generated ${fileType} file.`
          );
        });
        logger.error(err.message);
        return { error: err.message };
      });
    return true;
  } catch (err) {
    fs.unlink(attachmentPath, () => {
      logger.info(`Unexpected error! Deleting generated ${fileType} file.`);
    });
    logger.error(err.message);
    return { error: err.message };
  }
};
