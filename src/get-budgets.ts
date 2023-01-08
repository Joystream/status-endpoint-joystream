import { BN } from "bn.js";
import { JoyApi } from "./joyApi";

const api = new JoyApi();

type AvatarUri = string;

type GroupBudget = {
  icons: Array<AvatarUri>
  weeklyEarnings: number
  numberOfWorkers: number
}

const NonDescriptWorkingGroupMap: { [key: string] : string } = {
  operationsWorkingGroupAlpha: "buildersWorkingGroup",
  operationsWorkingGroupBeta: "hrWorkingGRoup",
  operationsWorkingGroupGamma: "marketingWorkingGroup"
}

type QNWorkingGroup = {
  name: string
  workers: Array<{ isLead: boolean, membership: { handle: string, metadata: { avatar: null | { avatarUri: string } } }, rewardPerBlock: string }>
}

const calculateWeeklyDollarAmountFromBlockReward = (api: JoyApi, blockRewardInHAPI: number) => {
  const JOY_IN_DOLLARS = 0.06;
  const BLOCKS_IN_A_WEEK = 10 * 60 * 24 * 7;

  const blockRewardInJOY = api.toJOY(new BN(blockRewardInHAPI));
  
  return blockRewardInJOY * BLOCKS_IN_A_WEEK * JOY_IN_DOLLARS;
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
    return []

  for(let workingGroup of response.workingGroups) {
    const workingGroupName: string = workingGroup.name.includes("operations") ? NonDescriptWorkingGroupMap[workingGroup.name] : workingGroup.name;

    groupBudgets[workingGroupName] = { icons: [], weeklyEarnings: 0, numberOfWorkers: workingGroup.workers.length }

    if(workingGroup.workers.length === 0)
      continue;

    for (let worker of workingGroup.workers) {
      // TODO: Do we want to disregard the leads?
      // if(worker.isLead)
      //   continue
      
      groupBudgets[workingGroupName].weeklyEarnings += calculateWeeklyDollarAmountFromBlockReward(api, Number(worker.rewardPerBlock));
      
      if(worker.membership.metadata.avatar)
        groupBudgets[workingGroupName].icons.push(worker.membership.metadata.avatar.avatarUri)
    }

  }

  return groupBudgets;
}

export async function getBudgets() {
  await api.init;

  // const validatorRewards = await api.calculateValidatorRewards(4)
  // const councilRewards = await api.councilRewards()

  const workingGroups = await workingGroupBudgetInfo(api);

  return {
    hello: "world",
    workingGroups
    // validatorRewards,
    // councilRewards
  };
}
