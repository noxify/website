import { ApolloClient } from 'apollo-client'
import { createHttpLink } from 'apollo-link-http'
import { split, from } from 'apollo-link'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { SubscriptionClient } from 'subscriptions-transport-ws'
import MessageTypes from 'subscriptions-transport-ws/dist/message-types'
import { WebSocketLink } from 'apollo-link-ws'
import { getMainDefinition } from 'apollo-utilities'
import { setContext } from 'apollo-link-context'

// Create the apollo client
export function createApolloClient ({
  // Client ID if using multiple Clients
  clientId = 'defaultClient',
  // URL to the HTTP API
  httpEndpoint,
  // Url to the Websocket API
  wsEndpoint = null,
  // Token used in localstorage
  tokenName = 'apollo-token',
  // Enable this if you use Query persisting with Apollo Engine
  persisting = false,
  // Is currently Server-Side Rendering or not
  ssr = false,
  // Only use Websocket for all requests (including queries and mutations)
  websocketsOnly = false,
  // Custom starting link.
  // If you want to replace the default HttpLink, set `defaultHttpLink` to false
  link = null,
  // If true, add the default HttpLink.
  // Disable it if you want to replace it with a terminating link using `link` option.
  defaultHttpLink = true,
  // Options for the default HttpLink
  httpLinkOptions = {},
  // Custom Apollo cache implementation (default is apollo-cache-inmemory)
  cache = null,
  // Options for the default cache
  inMemoryCacheOptions = {},
  // Additional Apollo client options
  apollo = {},
  // apollo-link-state options
  clientState = null,
  // Function returning Authorization header token
  getAuth,
  // Local Schema
  typeDefs = undefined,
  // Local Resolvers
  resolvers = undefined,
  // Hook called when you should write local state in the cache
  onCacheInit = undefined
}) {
  let wsClient, authLink, stateLink
  const disableHttp = websocketsOnly && !ssr && wsEndpoint

  // Apollo cache
  if (!cache) {
    cache = new InMemoryCache(inMemoryCacheOptions)
  }

  if (!disableHttp) {
    const httpLink = createHttpLink({
      uri: httpEndpoint,
      ...httpLinkOptions
    })

    if (!link) {
      link = httpLink
    } else if (defaultHttpLink) {
      link = from([link, httpLink])
    }

    // HTTP Auth header injection
    authLink = setContext(async (_, { headers }) => {
      const authorization = await getAuth()
      const authorizationHeader = authorization ? { authorization } : {}
      return {
        headers: {
          ...headers,
          ...authorizationHeader
        }
      }
    })

    // Concat all the http link parts
    link = authLink.concat(link)
  }

  // On the server, we don't want WebSockets and Upload links
  if (!ssr) {
    // If on the client, recover the injected state
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-underscore-dangle
      const state = window.__APOLLO_STATE__
      if (state && state[ clientId ]) {
        // Restore state
        cache.restore(state[ clientId ])
      }
    }

    // Web socket
    if (wsEndpoint) {
      wsClient = new SubscriptionClient( wsEndpoint, {
        lazy: true,
        reconnect: true,
        connectionParams: async () => {
          const authorization = await getAuth(tokenName)
          return { headers: { authorization } }
        }
      })

      // Create the subscription websocket link
      const wsLink = new WebSocketLink(wsClient)

      if (disableHttp) {
        link = wsLink
      } else {
        link = split(
          // split based on operation type
          ({ query }) => {
            const { kind, operation } = getMainDefinition(query)
            return kind === 'OperationDefinition' &&
              operation === 'subscription'
          },
          wsLink,
          link
        )
      }
    }
  }

  const apolloClient = new ApolloClient({
    link,
    cache,
    // Additional options
    ...(ssr ? {
      // Set this on the server to optimize queries when SSR
      ssrMode: true
    } : {
      // This will temporary disable query force-fetching
      ssrForceFetchDelay: 100,
      // Apollo devtools
      connectToDevTools: process.env.NODE_ENV !== 'production'
    }),
    typeDefs,
    resolvers,
    ...apollo
  })

  // Re-write the client state defaults on cache reset
  if (stateLink) {
    apolloClient.onResetStore(stateLink.writeDefaults)
  }

  if (onCacheInit) {
    onCacheInit(cache)
    apolloClient.onResetStore(() => onCacheInit(cache))
  }

  return {
    apolloClient,
    wsClient,
    stateLink
  }
}

export function restartWebsockets (wsClient) {
  // Copy current operations
  const operations = Object.assign({}, wsClient.operations)

  // Close connection
  wsClient.close(true)

  // Open a new one
  wsClient.connect()

  // Push all current operations to the new connection
  Object.keys(operations).forEach(id => {
    wsClient.sendMessage(
      id,
      MessageTypes.GQL_START,
      operations[ id ].options
    )
  })
}