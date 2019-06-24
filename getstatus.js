"use strict";
// @ts-check
Object.defineProperty(exports, "__esModule", { value: true });

const api_1 = require("@polkadot/api");
const types_1 = require("@joystream/types");
const BN = require('bn.js');

async function getStatusUpdate () {
  let update = {}

   // Initialise the provider to connect to the local node
   //const provider = new api_1.WsProvider('wss://staging-reckless.joystream.org/reckless/rpc/');
   //const provider = new api_1.WsProvider('wss://staging-lts.joystream.org/staging/rpc/');
   const provider = new api_1.WsProvider('ws://127.0.0.1:9944');
   // register types before creating the api
   types_1.registerJoystreamTypes();
   // Create the API and wait until ready
   const api = await api_1.ApiPromise.create(provider);
   
   
   // Retrieve the chain & node information information via rpc calls
   
   
   
   const [chain, nodeName, nodeVersion, peers] = await Promise.all([
       api.rpc.system.chain(),
       api.rpc.system.name(),
       api.rpc.system.version(),
       api.rpc.system.peers()
    ]);

    update.system = {
      'chain': chain,
      'name': nodeName,
      'version': nodeVersion,
      'peerCount': peers.length
    }

    // Retrieve finalized block height
    const finalizedHash = await api.rpc.chain.getFinalizedHead();
    const finalizedBlockNumber = await api.rpc.chain.getHeader(`${finalizedHash}`);
    update.block_height = (finalizedBlockNumber.blockNumber)

    // Retrieve runtime data
    const runtimeVersion = await api.rpc.chain.getRuntimeVersion(`${finalizedHash}`);
    update.runtime_version = {
        'spec_name': runtimeVersion.specName,
        'impl_name': runtimeVersion.implName,
        'spec_version': runtimeVersion.specVersion
    }
  
  // Retrieve council and election data
  const [councilMembers, electionStage] = await Promise.all([
    api.query.council.activeCouncil(),
    api.query.councilElection.stage()
  ]);
  update.council = {
    'members_count': councilMembers.length,
    'election_stage': electionStage.isSome ? electionStage.unwrap().type : "Not Running"
  }
    

  // Retrieve validator data
  const validators = await api.query.session.validators();
  update.validators = {
    count: validators.length
  }

  // This doesn't seem to return correct values
  if (validators && validators.length > 0) {
  // Retrieve the balances for all validators
    const validatorBalances = await Promise.all(validators.map(authorityId => api.query.balances.freeBalance(authorityId)));
    let totalValidatorBalances = validatorBalances.reduce((total, value) => total.add(value), new BN(0));
  
  update.validators.total_stake = totalValidatorBalances.toString();
}

// Retrieve membership data
const memberships = await api.query.membership.nextMemberId();
update.memberships = {
  'platform_members': memberships - 1
}

// Retrieve role data
const [storageProviders] = await Promise.all([
  api.query.actors.actorAccountIds()
]);

update.roles = {
  'storage_providers': storageProviders.length
}

// Retrieve media data (will add size of content later)
const [contentDirectory] = await Promise.all([
api.query.dataDirectory.knownContentIds(),
]);

update.media = {
  'media_files': contentDirectory.length
}

// Retrieve forum data
const [posts, threads] = await Promise.all([
  api.query.forum.nextPostId(),
  api.query.forum.nextThreadId()
]);
update.forum = {
  'posts': posts - 1,
  'threads': threads - 1
}

return update
}
module.exports = getStatusUpdate
