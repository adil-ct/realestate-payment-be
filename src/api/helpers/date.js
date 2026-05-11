import moment from 'moment';

const dateFormats = {
  getCurrentDateTime: () => moment().utc().toDate(),
  dateToUtc: (date) => moment(date).utc().toDate(),
  toLocalFormat: (date) =>
    moment(date).local().format('ddd MMM DD YYYY hh:mm A'),
  subtractDaysInDate: (date, days) => moment(date).subtract(days, 'days').utc(),
  tempPasswordExpiryTime: () => moment().add(48, 'hours').utc().toDate(),
  dateToUtcStartDate: (date) =>
    moment(new Date(date)).startOf('day').toISOString(),
  dateToUtcEndDate: (date) => moment(new Date(date)).endOf('day').toISOString(),
};

export default dateFormats;
