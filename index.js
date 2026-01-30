require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Partials } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});


function getTierConfig() {
  return [
    { tier: "TIER1", pass: process.env.PASS_TIER1, roleName: process.env.ROLE_TIER1 },
    { tier: "TIER2", pass: process.env.PASS_TIER2, roleName: process.env.ROLE_TIER2 },
    { tier: "TIER3", pass: process.env.PASS_TIER3, roleName: process.env.ROLE_TIER3 }
  ].filter(x => x.pass && x.roleName);
}

function findRole(guild, roleName) {
  return guild.roles.cache.find(r => r.name === roleName) || null;
}

async function dmAskPassword(user) {
  await user.send(
    "🔐 **How to Access**\n\n" +
    "Welcome to **BebouPMV** 💜.\n\n" +
    "To unlock the server channels, please send me here the **access password for this month**.\n\n" +
    "If your password is valid, your access will be granted automatically."
  );
}

client.once("ready", () => {
  console.log(`🤖 Bot connected : ${client.user.tag}`);
});

client.on("guildMemberAdd", async (member) => {
  try {
    await dmAskPassword(member.user);
  } catch {
    console.log(`❌ DM close for ${member.user.tag}`);
  }
});

// 2️⃣ messages handle (commande reset + DM password)
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // ====== COMMANDE ADMIN: !reset ======
  if (message.guild && message.content.trim().startsWith("!reset")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      message.channel.send("❌ You don't have the permision to use this command.");
      return;
    }

    const guild = message.guild;
    const tiers = getTierConfig();

    const parts = message.content.trim().split(/\s+/);
    const onlyTier = parts[1]?.toUpperCase(); 

    await guild.members.fetch(); // important: get all cache

    const targetTiers = onlyTier ? tiers.filter(t => t.tier === onlyTier) : tiers;
    if (targetTiers.length === 0) {
      message.channel.send("⚠️ no Tier find.");
      return;
    }

    const roles = targetTiers
      .map(t => ({ ...t, role: findRole(guild, t.roleName) }))
      .filter(t => t.role);

    if (roles.length === 0) {
      message.channel.send("⚠️ tag not find in .env file");
      return;
    }

    const memberIds = new Set();
    for (const r of roles) {
      for (const m of r.role.members.values()) memberIds.add(m.id);
    }

    message.channel.send(`🔄 Reset of (${memberIds.size} utilisateurs)...`);

    // Reset : remove tag + DM
    for (const memberId of memberIds) {
      const member = await guild.members.fetch(memberId).catch(() => null);
      if (!member) continue;

      try {
        for (const r of roles) {
          if (r.role && member.roles.cache.has(r.role.id)) {
            await member.roles.remove(r.role);
          }
        }
        await dmAskPassword(member.user);
      } catch {
        console.log(`❌ error during reset/DM ${member.user.tag}`);
      }
    }

    message.channel.send("✅ Reset finish.");
    return;
  }

// ====== DM part ======
if (!message.guild) {
  console.log("DM from ", message.author.tag, "| containt:", message.content);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const member = await guild.members.fetch(message.author.id).catch(() => null);

  if (!member) {
    await message.author.send("❌ Your not on the server.");
    return;
  }

  const input = message.content.trim();
  const tiers = getTierConfig();
  const matched = tiers.find(t => t.pass === input);

  if (!matched) {
    await message.author.send("❌ Wrong password.");
    return;
  }

  const role = findRole(guild, matched.roleName);
  if (!role) {
    await message.author.send("⚠️ Tag not found, please DM an admin.");
    return;
  }

  const allRoles = tiers.map(t => findRole(guild, t.roleName)).filter(Boolean);

  try {
    for (const r of allRoles) {
      if (r.id !== role.id && member.roles.cache.has(r.id)) {
        await member.roles.remove(r);
      }
    }

    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role);
    }

    await message.author.send(`✅ Accès accordé (${matched.tier}). Bienvenue.`);
  } catch (e) {
    console.log("error of tag attribution:", e);
    await message.author.send("❌ error of tag attributions.");
  }

  return;
  }
});

client.login(process.env.DISCORD_TOKEN);
