const NO_LIMIT_NUMBER = 1_000_000;

export const landingPageQueries = {
  videos: (offset: number, limit: number) => `
  {
    videos(offset: ${offset}, limit: ${limit}) {
      createdAt
      id
    }
  }`,
  auxiliaryData: `
  {
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
    channels(
      limit: ${NO_LIMIT_NUMBER}
      where: { totalVideosCreated_gt: 0 }
    ) {
      createdAt
      id
    }
  }`,
  simplePayments: `
    {
    channelPaymentMadeEvents(limit: ${NO_LIMIT_NUMBER}, orderBy: createdAt_DESC) {
      createdAt
      amount
      payeeChannel {
        id
        title
        avatarPhoto {
          id
          storageBag {
            id
          }
        }
      }
    }
  }`,
  carouselData: (numberOfCarouselItems: number) => `
  {
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
    channelPaymentMadeEvents(limit: 30, orderBy: createdAt_DESC) {
      createdAt
      amount
      payeeChannel {
        id
        title
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
  `,
  orionData: `{
    channels(limit: ${NO_LIMIT_NUMBER}, orderBy: followsNum_DESC) {
      id
      followsNum
    },
    channelFollows(limit: ${NO_LIMIT_NUMBER}) {
      timestamp
      id
    }
  }`,
};

export const getStorageBag = (storageBagId: string) => `
 {
  storageBags(where: { id_eq: "${storageBagId}" }) {
    distributionBuckets {
      operators {
        metadata {
          nodeEndpoint
        }
      }
    }
  }
 }
`;
