const NO_LIMIT_NUMBER = 1_000_000;

export const getLandingPageQuery = (numberOfCarouselItems: number) => `
{
  videos(limit: ${NO_LIMIT_NUMBER}) {
    createdAt
    id
  },
  channels(
    limit: ${NO_LIMIT_NUMBER}
    where: { totalVideosCreated_gt: 0 }
  ) {
    createdAt
    id
  },
  memberships(limit: ${NO_LIMIT_NUMBER}) {
    createdAt
    id
  },
  comments(limit: ${NO_LIMIT_NUMBER}) {
    createdAt
    id
  },
  videoReactions(limit: ${NO_LIMIT_NUMBER}) {
    createdAt
    id
  },
  commentReactions(limit: ${NO_LIMIT_NUMBER}) {
    createdAt
    id
  },
  ownedNfts(
    limit: ${numberOfCarouselItems}
    orderBy: lastSaleDate_DESC
    where: { lastSalePrice_gt: 0 }
  ) {
    lastSaleDate
    lastSalePrice
    creatorChannel {
      title
    }
    video {
      id
      title
      thumbnailPhotoId
      thumbnailPhoto {
        storageBag {
          distributionBuckets {
            operators {
              metadata {
                nodeEndpoint
              }
            }
          }
        }
      }
    }
  },
  proposals(limit: ${numberOfCarouselItems}, orderBy: statusSetAtTime_DESC) {
    details {
      __typename
    }
    title
    createdAt
    isFinalized
    status {
      __typename
    }
    id
    statusSetAtTime
    creator {
      metadata {
        avatar {
          ... on AvatarUri {
            avatarUri
          }
        }
      }
    }
  },
  channelPaymentMadeEvents(limit: ${NO_LIMIT_NUMBER}, orderBy: createdAt_DESC) {
    createdAt
    amount
    payeeChannel {
      id
      title
      rewardAccount
      ownerMember {
        id
        handle
      }
      avatarPhoto {
        id,
        storageBag {
          distributionBuckets {
            operators {
              metadata {
                nodeEndpoint
              }
            }
          }
        }
      }
    }
  }
}
`;
