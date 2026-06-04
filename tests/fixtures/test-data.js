'use strict';
const USERS = {
  admin:   { email: 'admin@re.local',   password: 'admin123',  role: 'admin'           },
  business:{ email: 'anna@re.local',    password: 'test123',   role: 'business'        },
  ba:      { email: 'marcus@re.local',  password: 'test123',   role: 'businessanalyst' },
  pm:      { email: 'tobias@re.local',  password: 'test123',   role: 'projectmanager'  },
  dev:     { email: 'laura@re.local',   password: 'test123',   role: 'developer'       },
};
const TEST_SYSTEM = { name:'Playwright-Test-System', description:'E2E-Test-System' };
const TEST_REQ = { title:'Nutzer kann sich einloggen', description:'Das System soll eine sichere Authentifizierung ermöglichen.', category:'Funktional', priority:'high' };
module.exports = { USERS, TEST_SYSTEM, TEST_REQ };
