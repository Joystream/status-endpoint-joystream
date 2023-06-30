import { BN } from "bn.js";
import { JoyApi } from "./joyApi";

const api = new JoyApi();

// TODO: These constants assume perfect uptime and are values in the optimal case. It might make
// sense to update the implementation to take the actual variability into account down the line.

// Constants:
const ERAS_IN_A_WEEK = 7 * 4;
const BLOCKS_IN_A_WEEK = 10 * 60 * 24 * 7;
const MAX_ERA_POINTS_TOTAL_VALUE = 72000;

// Types:
type AvatarUri = string;

type GroupBudget = {
  icons: Array<AvatarUri>
  weeklyEarnings: number
  numberOfWorkers: number
}

const NonDescriptWorkingGroupMap: { [key: string] : string } = {
  operationsWorkingGroupAlpha: "buildersWorkingGroup",
  operationsWorkingGroupBeta: "hrWorkingGroup",
  operationsWorkingGroupGamma: "marketingWorkingGroup"
}

type QNWorkingGroup = {
  name: string
  workers: Array<{ isLead: boolean, membership: { handle: string, metadata: { avatar: null | { avatarUri: string } } }, rewardPerBlock: string }>
}

type QNCouncil = Array<{ member: { metadata : { avatar: null | { avatarUri: string } } } }>

const calculateWeeklyJOYAmountFromBlockReward = (api: JoyApi, blockRewardInHAPI: number) => {
  const blockRewardInJOY = api.toJOY(new BN(blockRewardInHAPI));
  
  return blockRewardInJOY * BLOCKS_IN_A_WEEK;
}

const workingGroupBudgetInfo = async (api: JoyApi) => {
  const groupBudgets: { [key: string]: GroupBudget } = {};

  const response = await api.qnQuery<{ workingGroups: QNWorkingGroup[] }>(`
    {
      workingGroups {
      name,
      workers {
        isLead,
        membership {
          handle,
          metadata {
            avatar {
              ... on AvatarUri {
                avatarUri
              }
            }
          }
        },
        rewardPerBlock
      }
    }
  }
 `);

  if(!response)
    return groupBudgets;

  for(let workingGroup of response.workingGroups) {
    const workingGroupName: string = workingGroup.name.includes("operations") ? NonDescriptWorkingGroupMap[workingGroup.name] : workingGroup.name;

    groupBudgets[workingGroupName] = { icons: [], weeklyEarnings: 0, numberOfWorkers: workingGroup.workers.length }

    if(workingGroup.workers.length === 0)
      continue;

    for (let worker of workingGroup.workers) {
      groupBudgets[workingGroupName].weeklyEarnings += calculateWeeklyJOYAmountFromBlockReward(api, Number(worker.rewardPerBlock));
      
      if(worker.membership.metadata.avatar)
        groupBudgets[workingGroupName].icons.push(worker.membership.metadata.avatar.avatarUri)
    }

  }

  return groupBudgets;
}

const councilRewards = async (api: JoyApi) => {
  const councilorReward = await (await api.api.query.council.councilorReward()).toNumber();
  const councilorWeeklyRewardInJOY = (api.toJOY(new BN(councilorReward)) * BLOCKS_IN_A_WEEK);

  // TODO: Quick fix. Find a more reliable way to do this.
  const response = await api.qnQuery<{ councilMembers: QNCouncil }>(`
    {
      councilMembers(orderBy: lastPaymentBlock_DESC, limit: 3) {
        member {
          metadata {
            avatar {
              ... on AvatarUri {
                avatarUri
              }
            }
          }
        }
      }
    }
  `);

  if(!response)
    return { icons: [], weeklyEarnings: 0, numberOfWorkers: 0 };

  const icons = [];
  for(let councilMember of response.councilMembers) {
    const { member: { metadata: { avatar }}} = councilMember;

    if(avatar)
      icons.push(avatar.avatarUri);
  }

  return { icons, weeklyEarnings: councilorWeeklyRewardInJOY * response.councilMembers.length, numberOfWorkers: response.councilMembers.length };
}

const calculateValidatorRewards = async (api: JoyApi) => {
  const era = await (await api.api.query.staking.activeEra()).unwrap().index.toNumber() - 1;
  const previousEraValidatorReward = await (await api.api.query.staking.erasValidatorReward(era)).unwrap().toNumber();
  const previousEraValidatorPoints = await (await api.api.query.staking.erasRewardPoints(era)).total.toNumber();
  const validators = await (await api.api.query.session.validators()).toJSON() as string[];
  const totalRewardsInJOY = (api.toJOY(new BN(previousEraValidatorReward)) * ERAS_IN_A_WEEK) * (previousEraValidatorPoints / MAX_ERA_POINTS_TOTAL_VALUE);

  return { icons: [], weeklyEarnings: totalRewardsInJOY, numberOfWorkers: validators.length }
}

export async function getBudgets() {
  await api.init;

  const workingGroups = await workingGroupBudgetInfo(api);
  const council = await councilRewards(api);
  const validators = await calculateValidatorRewards(api)

  return {
    ...workingGroups,
    council,
    validators
  };
}
