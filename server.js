require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const readLastLines = require('read-last-lines');
const {
	REST,
	Routes,
	ActivityType,
	EmbedBuilder,
	Client,
	Events,
	Collection,
	GatewayIntentBits,
	Partials,
} = require('discord.js');
const { Server } = require('@fabricio-191/valve-server-query');
const emoji = require('node-emoji');

// Create a new client instance
const client = new Client({ intents: [
	GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildMessages,
	GatewayIntentBits.DirectMessages,
	GatewayIntentBits.MessageContent,
],
partials: [Partials.Channel],
});

client.commands = new Collection();

const commands = [];
let lastUser = null;
const lastDeaths = [];
const users = {};

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	}
	else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	commands.push(command.data.toJSON());
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(process.env.token);

// and deploy your commands!
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(process.env.clientId, process.env.guildId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);


	}
	catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();


client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);

	client.user.setActivity('LVD Valheim Server', { type: ActivityType.Watching });

	const voiceChannel = client.channels.cache.get(process.env.voiceChannelId);
	const channel = client.channels.cache.get(process.env.textChannelId);

	const initialEmbed = new EmbedBuilder()
		.setColor(0x0099FF)
		.setTitle('Bot online')
		.setAuthor({ name: c.user.username, iconURL: 'https://cdn.akamai.steamstatic.com/steam/apps/892970/capsule_616x353.jpg?t=1664981898' })
		.setDescription('Bot is online and ready to serve. \n')
		.setThumbnail('https://cdn.akamai.steamstatic.com/steam/apps/892970/capsule_616x353.jpg?t=1664981898')
		.setTimestamp()
		.setFooter({ text: `Created with ${emoji.get('heart')} by Almighty Sasquatch` });

	channel.send({ embeds: [initialEmbed] });

	readLogs();

	setInterval(async () => {
		try {
			const server = await Server({
				ip: 'valheim.sdev.lv',
				port: 2457,
				timeout: 3000,
			});

			const playerList = await server.getPlayers();

			voiceChannel.edit({ name: `${emoji.get('video_game')} In-Game: ${playerList.length} / 10` });

		}
		catch (error) {
			const errorEmbed = new EmbedBuilder()
				.setColor(0xFF0000)
				.setTitle('Error')
				.setAuthor({ name: 'LVD Valheim', iconURL: 'https://cdn.akamai.steamstatic.com/steam/apps/892970/capsule_616x353.jpg?t=1664981898' })
				.setDescription(`${error}`)
				.setThumbnail('https://cdn.akamai.steamstatic.com/steam/apps/892970/capsule_616x353.jpg?t=1664981898')
				.setTimestamp()
				.setFooter({ text: `Created with ${emoji.get('heart')} by Almighty Sasquatch` });

			await channel.send({ embeds: [errorEmbed], ephemeral: true });

		}


	}, 5000);
});


client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	}
	catch (error) {
		console.error(error);
		await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
	}
});


client.login(process.env.token);

client.on(Events.MessageCreate, async msg => {
	// You can view the msg object here with console.log(msg)

	if (msg.author.bot) return;

	// check if the msg is a direct message
	if (msg.channel.type === 1) {
		const dmLogEmbed = new EmbedBuilder()
			.setColor(0x0099FF)
			.setTitle(`${msg.author.tag} dmed the bot and said: `)
			.setAuthor({ name: 'New Message', iconURL: 'https://cdn.akamai.steamstatic.com/steam/apps/892970/capsule_616x353.jpg?t=1664981898' })
			.setDescription(msg.content)
			.setTimestamp()
			.setFooter({ text: `User's id: ${msg.author.id}` });

		client.channels.fetch(process.env.textChannelId).then((channel) => {

			channel.send({ embeds: [dmLogEmbed], ephemeral: true });

		});
	}
});

const readLogs = () => {
	const plogDeath = '.*?Got character ZDOID from (.*) : 0:0';
	// const pdisconnected = '.*Closing socket (\d+)';
	// const phandshake = '.*handshake from client (\d+)';
	// const pevent = '.*? Random event set:(\\w+)';


	console.log('Starting to read logs');


	fs.watchFile(process.env.logFile, {

		// Passing the options parameter
		bigint: false,
		persistent: true,
		interval: 100,
	}, () => {

		readLastLines.read(process.env.logFile, 5).then((lines) => {
			const fileLines = lines.split('\n');

			console.log(lines);

			for (const line of fileLines) {
				const handshake = line.match(/(handshake from client )(\d+)/);
				const plogDeathMatch = line.match(plogDeath);
				const userMatch = line.match(/(Got character ZDOID from )([\w ]+)(\s:)/);
				const disconnected = line.match(/(Closing socket )(\d\d+)/);

				if (handshake) {
					const id = handshake[2];
					const time = new Date(line.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/));
					if (!users[id]) {
						users[id] = { connected: time, disconnected: undefined, user: undefined };
						lastUser = id;
					}
				}
				if (disconnected) {
					const id = disconnected[2];

					if (users[id]) {
						const playerDisconnectedEmbed = new EmbedBuilder()
							.setColor(0x0099FF)
							.setTitle(`${users[id].user} just disconnected from the server!`)
							.setAuthor({ name: 'Player Log' })
							.setTimestamp();

						client.channels.fetch(process.env.textChannelId).then((channel) => {
							channel.send({ embeds: [playerDisconnectedEmbed] });
						});

						delete users[id];
					}

				}

				if (userMatch) {
					if (lastUser) {
						users[lastUser].user = userMatch[2];

						for (const u in users) {
							if (users[u].user == userMatch[2] && u !== lastUser) delete users[u];
						}

						const playerConnectedEmbed = new EmbedBuilder()
							.setColor(0x0099FF)
							.setTitle(`${users[lastUser].user} just connected to the server!`)
							.setAuthor({ name: 'Player Log' })
							.setTimestamp();

						client.channels.fetch(process.env.textChannelId).then((channel) => {
							channel.send({ embeds: [playerConnectedEmbed] });
							lastUser = null;
						});

					}
				}

				if (plogDeathMatch) {
					if (!lastDeaths.includes(plogDeathMatch[0])) {
						const playerName = plogDeathMatch[1];

						const playerLogEmbed = new EmbedBuilder()
							.setColor(0x0099FF)
							.setTitle(`${playerName} just died! ${emoji.get('skull')}`)
							.setAuthor({ name: 'Player Log' })
							.setTimestamp();

						client.channels.fetch(process.env.textChannelId).then((channel) => {

							channel.send({ embeds: [playerLogEmbed] });

						});

						lastDeaths.push(plogDeathMatch[0]);
					}

				}

			}

		});
	});
};