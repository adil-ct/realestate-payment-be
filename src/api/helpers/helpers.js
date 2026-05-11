import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const checkPassword = async (enteredPassword, storedPassword) => {
  return await bcrypt.compare(enteredPassword, storedPassword);
};

const generateuuid = async () => {
  return uuidv4();
};

export { checkPassword, generateuuid };
