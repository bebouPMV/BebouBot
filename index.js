require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Partials } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,      // utile pour !reset
    GatewayIntentBits.DirectMessages,     // DM
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User] // ✅ important
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
    "🔐 **Accès abonnés**\n\n" +
    "Envoie-moi ton **mot de passe** pour déverrouiller ton tier.\n" +
    "Tu peux coller le code ici directement."
  );
}

client.once("ready", () => {
  console.log(`🤖 Bot connecté : ${client.user.tag}`);
});

// 1️⃣ DM automatique à l'arrivée
client.on("guildMemberAdd", async (member) => {
  try {
    await dmAskPassword(member.user);
  } catch {
    console.log(`❌ DM fermé pour ${member.user.tag}`);
  }
});

// 2️⃣ Gestion messages (commande reset + DM password)
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // ====== COMMANDE ADMIN: !reset ======
  if (message.guild && message.content.trim().startsWith("!reset")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      message.channel.send("❌ Tu n'as pas la permission d'utiliser cette commande.");
      return;
    }

    const guild = message.guild;
    const tiers = getTierConfig();

    // Option: !reset TIER2 (reset un seul tier)
    const parts = message.content.trim().split(/\s+/);
    const onlyTier = parts[1]?.toUpperCase(); // ex: TIER2

    await guild.members.fetch(); // important: cache complet

    const targetTiers = onlyTier ? tiers.filter(t => t.tier === onlyTier) : tiers;
    if (targetTiers.length === 0) {
      message.channel.send("⚠️ Aucun tier trouvé (utilise: !reset ou !reset TIER1/TIER2/TIER3).");
      return;
    }

    // Collecte des membres à reset (union des rôles)
    const roles = targetTiers
      .map(t => ({ ...t, role: findRole(guild, t.roleName) }))
      .filter(t => t.role);

    if (roles.length === 0) {
      message.channel.send("⚠️ Rôles introuvables. Vérifie les noms ROLE_TIER1/2/3 dans .env");
      return;
    }

    // Comptage total (sans doublons)
    const memberIds = new Set();
    for (const r of roles) {
      for (const m of r.role.members.values()) memberIds.add(m.id);
    }

    message.channel.send(`🔄 Reset en cours (${memberIds.size} utilisateurs)...`);

    // Reset : retirer les rôles + DM
    for (const memberId of memberIds) {
      const member = await guild.members.fetch(memberId).catch(() => null);
      if (!member) continue;

      try {
        // retire uniquement les rôles ciblés
        for (const r of roles) {
          if (r.role && member.roles.cache.has(r.role.id)) {
            await member.roles.remove(r.role);
          }
        }
        await dmAskPassword(member.user);
      } catch {
        console.log(`❌ Impossible de reset/DM ${member.user.tag}`);
      }
    }

    message.channel.send("✅ Reset terminé.");
    return;
  }

// ====== TRAITEMENT DM ======
if (!message.guild) {
  console.log("DM reçu de", message.author.tag, "| contenu:", message.content);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const member = await guild.members.fetch(message.author.id).catch(() => null);

  if (!member) {
    await message.author.send("❌ Tu n'es pas sur le serveur.");
    return;
  }

  const input = message.content.trim();
  const tiers = getTierConfig();
  const matched = tiers.find(t => t.pass === input);

  if (!matched) {
    await message.author.send("❌ Mot de passe incorrect.");
    return;
  }

  const role = findRole(guild, matched.roleName);
  if (!role) {
    await message.author.send("⚠️ Rôle introuvable côté serveur. Contacte l’admin.");
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
    console.log("Erreur attribution role:", e);
    await message.author.send("❌ Impossible d’attribuer le rôle (permissions?).");
  }

  return;
  }
});

client.login(process.env.DISCORD_TOKEN);
