# knex Provider for Discord.js-Commando

This package adds support for [knex](http://knexjs.org/) to be used as a provider in Discord.js-Commando.
It uses only one database and creates a new column for each new value.

Also, you can store User/Member- settings with it. Only pass an user(id) instead of a guild.

## Installation

```js
npm install knexprovider
```

## Usage

```js
const knex = require('knex')({
    client: 'mysql',
    connection: {
        host: '127.0.0.1',
        user: 'your_database_user',
        password: 'your_database_password',
        database: 'myapp_test'
    }
});

const commando = require('discord.js-commando');
const client = new commando.Client({
    owner: "ownerid",
    commandPrefix: "!"
});

const KnexProvider = require('knexprovider');
client.setProvider(new KnexProvider(knex));


client.registry
    .registerDefaultTypes()
    .registerDefaultGroups()
    .registerDefaultCommands()
    .registerCommandsIn(path.join(__dirname, 'commands'));

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
    client.user.setActivity('with Commando');
});

client.on('error', console.error);

client.login('your-token-goes-here');
```
