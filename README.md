# status-endpoint-joystream

Status endpoint for the Joystream network

## How to Install

Clone the repo, then run:

```
$ yarn
```

Add your config variables to `.env`, create `exchanges.json` (see: `exchanges.example.json) file and then run:

```
$ yarn start
```

to build and start the server.

## Logs

```
# All logs
$ yarn pm2 logs status-server

# Errors only
$ yarn pm2 logs status-server --err
```

## Shutdown

```
yarn pm2 delete status-server
```

## Updating the server after runtime upgrade

```
# 1. Kill the process
yarn pm2 delete status-server

# 2. Make sure lastProcessedBlock is >= RUNTIME_UPGRADE_BLOCK_NUMBER
jq .lastBlockProcessed exchanges.json

# 3. Make sure there were no exchanges at or after RUNTIME_UPGRADE_BLOCK_NUMBER as they may have been processed incorrectly.
# In case there were any - see "Handling exchanges at or after RUNTIME_UPGRADE_BLOCK_NUMBER" below
jq .exchanges[-1].blockHeight exchanges.json

# 4. Set `lastBlockProcessed` to RUNTIME_UPGRADE_BLOCK_NUMBER-1 (use the actual number!)
jq '.lastBlockProcessed=RUNTIME_UPGRADE_BLOCK_NUMBER-1' exchanges.json > exchanges-tmp.json && mv exchanges-tmp.json exchanges.json

# 5. Start the new status server
cp exchanges.json exchanges-backup.json
git checkout new_status_server_branch
cp exchanges-backup.json exchanges.json
yarn && yarn start
```

### Handling exchanges at or after `RUNTIME_UPGRADE_BLOCK_NUMBER`

In case some exchanges happend at or after the runtime upgrade, but before the new version of the server was started (at step 3.), they need to be manually removed from `exchanges.json` (this is the limitation of the current implementation). In order to remove those exchanges:

1. Let sum of the USD amount of those exchanges be `s`
2. Increase `sizeDollarPool` by `s`
3. Decrease `totalUSDPaid` by `s`
4. Remove those exchanges from `exchanges` array
5. Remove any entries in `poolChangeHistory` related to those exchanges