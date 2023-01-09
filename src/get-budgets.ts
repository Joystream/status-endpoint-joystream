import { BN } from "bn.js";
import { JoyApi } from "./joyApi";

const api = new JoyApi();

// Constants:
const ERAS_IN_A_WEEK = 7 * 4;
const BLOCKS_IN_A_WEEK = 10 * 60 * 24 * 7;

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
      // TODO: Do we want to disregard the leads?
      // if(worker.isLead)
      //   continue
      
      groupBudgets[workingGroupName].weeklyEarnings += calculateWeeklyJOYAmountFromBlockReward(api, Number(worker.rewardPerBlock));
      
      if(worker.membership.metadata.avatar)
        groupBudgets[workingGroupName].icons.push(worker.membership.metadata.avatar.avatarUri)
    }

  }

  return groupBudgets;
}

const councilRewards = async (api: JoyApi) => {
  const councilorReward = await (await api.api.query.council.councilorReward()).toNumber();
  const announcingPeriodDurationInBlocks = await api.api.consts.council.announcingPeriodDuration.toNumber();
  // TODO: This calculation might need to be revisited.
  const councilorWeeklyRewardInJOY = (api.toJOY(new BN(councilorReward)) * announcingPeriodDurationInBlocks) / 2;

  const response = await api.qnQuery<{ councilMembers: QNCouncil }>(`
    {
      councilMembers {
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
  const era = await (await api.api.query.staking.currentEra()).unwrap().toNumber();
  const previousEraValidatorReward = await (await api.api.query.staking.erasValidatorReward(era - 1)).unwrap().toNumber();
  const validators = await (await api.api.query.session.validators()).toJSON() as string[];
  const totalRewardsInJOY = api.toJOY(new BN(previousEraValidatorReward)) * ERAS_IN_A_WEEK;

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
