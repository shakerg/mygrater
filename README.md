# Mygrater
Yes, I know it's spelled wrong, that's on purpose.

log
## Overview

Mygrater is a tool designed to facilitate the migration of forks using JavaScript and the Octokit library. It simplifies the process of managing and migrating repositories and their forks between organizations on GitHub. The script automates tasks such as checking pull requests, cloning repositories, and migrating forks, making it easier to maintain and transfer codebases across different environments.

## Features

- Automates the migration of repository forks.
- Utilizes the Octokit library to interact with GitHub's API.
- Written in JavaScript for easy customization and integration.
- Supports checking pull requests, cloning repositories, and migrating forks.

## Getting Started

### Prerequisites

- Node.js installed on your machine.
- GitHub account with appropriate permissions.
- GitHub personal access token for API access on each platform.


### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/shakerg/mygrater.git
   ```

2. Install dependencies:
   ```bash
   cd mygrater
   npm install
   ```

3. Set up environment variables:
   - Create either an .env file or set environment variables directly - OR -
   - Configure the following variables, replacing the placeholders with your own values in config.js.
     - `GITHUB_TOKEN`: Your GitHub personal access token for GitHub Enterprise Server.
     - `GITHUB_COM_TOKEN`: Your GitHub personal access token for github.com.
     - `GITHUB_API_URL`: The API URL for your GitHub Enterprise Server.
     - `TARGET_ORG`: The target organization where repositories will be migrated.

4. Run the script:
   ```bash
   node mygrater.js <SOURCE_ORG> <SOURCE_REPO>
   ```
