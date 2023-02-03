const EMAIL_REGEX = /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
const PASSWORD_REGEX = /[A-Za-z0-9-_!@#$%^&*()=+]{6,32}/;
const PHONE_REGEX = /^\+[0-9]{1,3} ?([0-9]+|\([0-9]+\))([ -][0-9]+)+$/;
const HUMAN_NAME_REGEX = /^[A-ZА-ЯЁ]+[A-Za-zА-Яа-яЁё]+$/;

module.exports = {
	EMAIL_REGEX, PASSWORD_REGEX, PHONE_REGEX, HUMAN_NAME_REGEX
};
