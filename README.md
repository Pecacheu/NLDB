# NLDB
NLDB is a highly flexible, multi-user inventory management system built on a modern, performant, and secure web stack (HTML5, NodeJS, Argon2, MongoDB.) It empowers you to track taggable tools & assets, parts, consumables, and just about anything else!

Best of all, it's desktop and mobile-friendly, lightweight, and stores data efficiently via MongoDB documents and indexes, making it scalable and backup-friendly.

# Features
NLDB works with and can both the **Unique Asset** data model *(best for tracking unique, high-value assets, like PCs; think [Snipe-IT](https://snipeitapp.com) or [AssetSonar](https://ezo.io/assetsonar))* and the **Parts & Stock** data model *(best for tracking inventory, POs, and BOMs; think [BOMIST](https://bomist.com) or [Altium Agile](https://www.altium.com/agile/teams))*. Pair that with support for multiple independent databases plus a granular user permissions system, and you can finally unify all your tracking needs into one easy-to-use, high performance- and crucially- easily backed up open-source platform!

### 🧘 Relaxed view
![](doc/Default.png)

### 🗂️ Detailed list view w/ custom sort
![](doc/List.png)

### 🌎 Hierarchical location tree
![](doc/Tablet.png)

### ✨ Customizable theme, logo, and branding
![](doc/Theme.png)

### 📱 Works great on mobile

### 🚀 High-performance universal search
<img src=doc/Mobile.png width=30%>

### 📅 Custom data fields & form inputs
![](doc/Data.png)

### 🧲 Easy Duplicate & Bulk Operations
<img src=doc/Copy.png width=60%>

### 📜 History Log & Auditing
![](doc/History.png)

### 👥 Granular user permissions & multi-database support
![](doc/Perms.png)

### 📷 Scannable QR codes for tracking
<img src=doc/QR.png width=60%>

### 🧪 Extendable API
NLDB's REST API is powerful and extendable, enabling advanced integrations and even interactive extensions like custom check-in forms served directly within the web-client- all without your users needing to install any external program.

More details on API usage & examples to come soon.

# Installation
The easiest way to get started with NLDB is via Docker. After installing Docker and the Compose extension, clone the repo and run `bash run.sh`. The environment should be set up automatically. A default *config.json* will also be generated. Basic settings can be edited here, however the port should be left at 8080. Change this instead in *compose.yaml* under `services.app.ports` (edit the number on the left side of the `:`).

In *compose.yaml* under `services.app.volumes`, you'll find entries for *key* and *cert*. Change `/dev/null` to the path to your private key and public certificate for HTTPS. If you're using Lets Encrypt, this will be `/etc/ssl/<site name>/privkey.pem` and `/etc/ssl/<site name>/fullchain.pem`. If you don't wish to use HTTPS, set *sslKey* and *sslCert* in *config.json* to empty strings.

**Note:** NLDB is designed to safely and securely face the Open Web (eg. API is encrypted and authenticated, endpoints are rate limited, timing attacks are mitigated, repeated login failure triggers IP ban, etc), but for added peace of mind, it can also be firewalled behind a corporate VPN. Just make sure that *the domain or IP you access NLDB from remains constant,* because it will be hard-coded into any tracking QR codes you generate. If it changes, you'll have to re-print your labels!

You can also configure NLDB manually outside of a container. You'll need a recent version of Node.js (at least v22). CD into `app` , install dependencies with `npm i`, then run with `node server`. Edit *config.json* and set *dbUri* as appropriate to connect to your MongoDB instance.

# First Time Setup
Once NLDB is running, visit it in a browser. For now, there's no fancy setup wizard. Simply create an account, then open the menu and choose Settings. By default, anyone can make an account freely, though only the first account defaults to full admin access. You probably don't want this, so you'll want to either enable Invite Codes (for now, these are one-time-use), or change the Email Domain setting, which limits the emails with which users may create accounts to your organization's domain.

## Disclaimer

🚫 No AI-generated i.e. "vibe-coded" code or assets are present in this project. We intend to keep it that way; while using AI as a research assistant is fine, please do not submit low-effort AI-generated PRs.

<!--
## Key Controls
#### Everywhere:
`Home` = Index/Search\
`Alt` or `ContextMenu` = Toggle Edit Mode\
`CTRL` = Usage Help (General help and tips + controls) -- **TODO**\
`Escape` = Go Back

#### In Menu:
`Escape` = Close Menu

#### Edit Mode:
`Insert` = Add Item\
`Escape` = Cancel Edit Mode

#### When Dragging or Renaming:
`Enter` = Confirm Name Edit\
`Escape` = Cancel Drag/Edit
-->