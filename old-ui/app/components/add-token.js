const React = require('react')
const { Component } = React
const h = require('react-hyperscript')
const connect = require('react-redux').connect
const actions = require('../../../ui/app/actions')
const { setPendingTokens, clearPendingTokens, displayWarning, goHome, addToken } = actions
const Tooltip = require('./tooltip.js')
const TabBar = require('./tab-bar')
// const { CONFIRM_ADD_TOKEN_ROUTE } = require('../../ui/app/routes')
const { checkExistingAddresses } = require('../../../ui/app/components/pages/add-token/util')
const TokenList = require('../../../ui/app/components/pages/add-token/token-list')
const TokenSearch = require('../../../ui/app/components/pages/add-token/token-search')
const { tokenInfoGetter } = require('../../../ui/app/token-util')
const ethUtil = require('ethereumjs-util')
const abi = require('human-standard-token-abi')
const Eth = require('ethjs-query')
const EthContract = require('ethjs-contract')
const PropTypes = require('prop-types')

const emptyAddr = '0x0000000000000000000000000000000000000000'
const SEARCH_TAB = 'SEARCH'
const CUSTOM_TOKEN_TAB = 'CUSTOM_TOKEN'

const mapStateToProps = ({metamask}) => {
  const { identities, tokens, pendingTokens, network } = metamask
  return {
    identities,
    tokens,
    network,
    pendingTokens,
  }
}

const mapDispatchToProps = dispatch => {
  return {
    setPendingTokens: tokens => dispatch(setPendingTokens(tokens)),
    clearPendingTokens: () => dispatch(clearPendingTokens()),
    displayWarning: (warn) => dispatch(displayWarning(warn)),
    goHome: () => dispatch(goHome()),
    addToken: (address, symbol, decimals, token) => dispatch(addToken(address, symbol, decimals, token)),
  }
}

class AddTokenScreen extends Component {

  static contextTypes = {
    t: PropTypes.func,
  }

  static propTypes = {
    // history: PropTypes.object,
    setPendingTokens: PropTypes.func,
    pendingTokens: PropTypes.object,
    clearPendingTokens: PropTypes.func,
    displayWarning: PropTypes.func,
    tokens: PropTypes.array,
    identities: PropTypes.object,
    address: PropTypes.string,
    dispatch: PropTypes.func,
    network: PropTypes.string,
  }

  constructor (props) {
    super(props)
    this.state = {
      warning: null,
      customAddress: '',
      customSymbol: 'Token',
      customDecimals: 18,
      searchResults: [],
      selectedTokens: {},
      tokenSelectorError: null,
      customAddressError: null,
      customSymbolError: null,
      customDecimalsError: null,
      autoFilled: false,
      displayedTab: SEARCH_TAB,
    }
    Component.call(this)
  }

  componentDidMount () {
    this.tokenInfoGetter = tokenInfoGetter()
    const { pendingTokens = {} } = this.props
    const pendingTokenKeys = Object.keys(pendingTokens)

    if (pendingTokenKeys.length > 0) {
      let selectedTokens = {}
      let customToken = {}

      pendingTokenKeys.forEach(tokenAddress => {
        const token = pendingTokens[tokenAddress]
        const { isCustom } = token

        if (isCustom) {
          customToken = { ...token }
        } else {
          selectedTokens = { ...selectedTokens, [tokenAddress]: { ...token } }
        }
      })

      const {
        address: customAddress = '',
        symbol: customSymbol = '',
        decimals: customDecimals = 0,
      } = customToken

      const displayedTab = Object.keys(selectedTokens).length > 0 ? SEARCH_TAB : CUSTOM_TOKEN_TAB
      this.setState({ selectedTokens, customAddress, customSymbol, customDecimals, displayedTab })
    }
  }

  render () {
    const { network } = this.props
    const networkID = parseInt(network)
    let views = []
    networkID === 1 ? views = [h(TabBar, {
          tabs: [
            { content: 'Search', key: SEARCH_TAB },
            { content: 'Custom', key: CUSTOM_TOKEN_TAB },
          ],
          defaultTab: this.state.displayedTab || CUSTOM_TOKEN_TAB,
          tabSelected: (key) => this.setCurrentAddTokenTab(key),
        }),
        this.tabSwitchView()] : views = [this.renderAddToken()]

    return (
      h('.flex-column.flex-grow', {
        style: {
          width: '100%',
        },
      }, [
        // subtitle and nav
        h('.section-title.flex-row.flex-center', {
          style: {
            background: '#60269c',
          },
        }, [
          h('h2.page-subtitle', {
            style: {
              color: '#ffffff',
            },
          }, 'Add Token'),
        ]),

        ...views,
      ])
    )
  }

  setCurrentAddTokenTab (key) {
    this.setState({displayedTab: key})
  }

  tabSwitchView () {
    const state = this.state
    const { displayedTab } = state
    switch (displayedTab) {
      case CUSTOM_TOKEN_TAB:
        return this.renderAddToken()
      default:
        return this.renderTabBar()
    }
  }

  renderAddToken () {
    const props = this.props
    const state = this.state
    const { warning, customSymbol, customDecimals } = state
    const { network, goHome, addToken } = props
    return h('.flex-column.flex-justify-center.flex-grow.select-none', [
        warning ? h('div', {
          style: {
            margin: '20px 30px 0 30px',
          },
        }, [
          h('.error', {
            style: {
              display: 'block',
            },
          }, warning),
        ]) : null,
      h('.flex-space-around', {
        style: {
          padding: '30px',
        },
      }, [

        h('div', [
          h(Tooltip, {
            position: 'top',
            title: 'The contract of the actual token contract.',
          }, [
            h('span', {
              style: { fontWeight: 'bold'},
            }, 'Token Address' /* this.context.t('tokenAddress')*/),
          ]),
        ]),

        h('section.flex-row.flex-center', [
          h('input.large-input#token-address', {
            name: 'address',
            placeholder: 'Token Contract Address',
            style: {
              width: '100%',
              margin: '10px 0',
            },
            onChange: e => this.handleCustomAddressChange(e.target.value),
          }),
        ]),

        h('div', [
          h('span', {
            style: { fontWeight: 'bold', paddingRight: '10px'},
          }, 'Token Symbol' /* this.context.t('tokenSymbol')*/),
        ]),

        h('div', { style: {display: 'flex'} }, [
          h('input.large-input#token_symbol', {
            placeholder: `Like "ETH"`,
            value: customSymbol,
            style: {
              width: '100%',
              margin: '10px 0',
            },
            onChange: e => this.handleCustomSymbolChange(e.target.value),
          }),
        ]),

        h('div', [
          h('span', {
            style: { fontWeight: 'bold', paddingRight: '10px'},
          }, 'Decimals of Precision' /* this.context.t('decimal')*/),
        ]),

        h('div', { style: {display: 'flex'} }, [
          h('input.large-input#token_decimals', {
            value: customDecimals,
            type: 'number',
            min: 0,
            max: 36,
            style: {
              width: '100%',
              margin: '10px 0',
            },
            onChange: e => this.handleCustomDecimalsChange(e.target.value),
          }),
        ]),

        h('div', {
          key: 'buttons',
          style: {
            alignSelf: 'center',
            float: 'right',
            marginTop: '10px',
          },
        }, [
          h('button.btn-violet', {
            onClick: () => {
              goHome()
            },
          }, 'Cancel' /* this.context.t('cancel')*/),
          h('button', {
            onClick: (event) => {
              const valid = this.validateInputs()
              if (!valid) return

              const { customAddress, customSymbol, customDecimals } = this.state
              addToken(customAddress.trim(), customSymbol.trim(), customDecimals, network)
                .then(() => {
                  goHome()
                })
            },
          }, 'Add' /* this.context.t('addToken')*/),
        ]),
      ]),
    ])
  }

  renderTabBar () {
    const props = this.props
    const state = this.state
    const { tokenSelectorError, selectedTokens, searchResults } = state
    const { clearPendingTokens, goHome } = props
    return h('div', [
      h('.add-token__search-token', [
       h(TokenSearch, {
        onSearch: ({ results = [] }) => this.setState({ searchResults: results }),
        error: tokenSelectorError,
       }),
       h('.add-token__token-list', {
          style: {
            marginTop: '20px',
            height: '250px',
            overflow: 'auto',
          },
        }, [
          h(TokenList, {
            results: searchResults,
            selectedTokens: selectedTokens,
            onToggleToken: token => this.handleToggleToken(token),
          }),
        ]),
      ]),
      h('.page-container__footer', [
        h('.page-container__footer-container', [
          h('button.btn-violet', {
            onClick: () => {
              clearPendingTokens()
              goHome()
            },
          }, 'Cancel' /* this.context.t('cancel')*/),
          h('button.btn-primary', {
            onClick: () => this.handleNext(),
            disabled: this.hasError() || !this.hasSelected(),
          }, 'Next' /* this.context.t('next')*/),
        ]),
      ]),
    ])
  }

  componentWillMount () {
    if (typeof global.ethereumProvider === 'undefined') return

    this.eth = new Eth(global.ethereumProvider)
    this.contract = new EthContract(this.eth)
    this.TokenContract = this.contract(abi)
  }

  componentWillUnmount () {
    const { displayWarning } = this.props
    displayWarning('')
  }

  validateInputs () {
    let msg = ''
    const state = this.state
    const identitiesList = Object.keys(this.props.identities)
    const { customAddress: address, customSymbol: symbol, customDecimals: decimals } = state
    const standardAddress = ethUtil.addHexPrefix(address).toLowerCase()

    const validAddress = ethUtil.isValidAddress(address)
    if (!validAddress) {
      msg += 'Address is invalid.'
    }

    const validDecimals = decimals >= 0 && decimals < 36
    if (!validDecimals) {
      msg += 'Decimals must be at least 0, and not over 36. '
    }

    const symbolLen = symbol.trim().length
    const validSymbol = symbolLen > 0 && symbolLen < 10
    if (!validSymbol) {
      msg += 'Symbol must be between 0 and 10 characters.'
    }

    const ownAddress = identitiesList.includes(standardAddress)
    if (ownAddress) {
      msg = 'Personal address detected. Input the token contract address.'
    }

    const isValid = validAddress && validDecimals && !ownAddress

    if (!isValid) {
      this.setState({
        warning: msg,
      })
    } else {
      this.setState({ warning: null })
    }

    return isValid
  }

  handleToggleToken = (token) => {
    const { address } = token
    const { selectedTokens = {} } = this.state
    const selectedTokensCopy = { ...selectedTokens }

    if (address in selectedTokensCopy) {
      delete selectedTokensCopy[address]
    } else {
      selectedTokensCopy[address] = token
    }

    this.setState({
      selectedTokens: selectedTokensCopy,
      tokenSelectorError: null,
    })
  }

  hasError = () => {
    const {
      tokenSelectorError,
      customAddressError,
      customSymbolError,
      customDecimalsError,
    } = this.state

    return tokenSelectorError || customAddressError || customSymbolError || customDecimalsError
  }

  hasSelected = () => {
    const { customAddress = '', selectedTokens = {} } = this.state
    return customAddress || Object.keys(selectedTokens).length > 0
  }

  handleNext = () => {
    if (this.hasError()) {
      return
    }

    if (!this.hasSelected()) {
      this.setState({ tokenSelectorError: 'Must select at least 1 token.' /* this.context.t('mustSelectOne')*/ })
      return
    }

    const { setPendingTokens, network/* , history*/ } = this.props
    const {
      customAddress: address,
      customSymbol: symbol,
      customDecimals: decimals,
      selectedTokens,
    } = this.state

    const customToken = {
      address,
      symbol,
      decimals,
      network: network,
    }

    setPendingTokens({ customToken, selectedTokens })
    // history.push(CONFIRM_ADD_TOKEN_ROUTE)
  }

  attemptToAutoFillTokenParams = async (address) => {
    const { symbol = '', decimals = 0 } = await this.tokenInfoGetter(address)

    const autoFilled = Boolean(symbol && decimals)
    this.setState({ autoFilled })
    this.handleCustomSymbolChange(symbol || '')
    this.handleCustomDecimalsChange(decimals)
  }

  handleCustomAddressChange = (value) => {
    const customAddress = value.trim()
    this.setState({
      customAddress,
      customAddressError: null,
      tokenSelectorError: null,
      autoFilled: false,
    })

    const isValidAddress = ethUtil.isValidAddress(customAddress)
    const standardAddress = ethUtil.addHexPrefix(customAddress).toLowerCase()

    switch (true) {
      case !isValidAddress:
        this.setState({
          customAddressError: 'Invalid address' /* this.context.t('invalidAddress')*/,
          customSymbol: '',
          customDecimals: 0,
          customSymbolError: null,
          customDecimalsError: null,
        })

        break
      case Boolean(this.props.identities[standardAddress]):
        this.setState({
          customAddressError: 'Personal address detected. Input the token contract address.' /* this.context.t('personalAddressDetected')*/,
        })

        break
      case checkExistingAddresses(customAddress, this.props.tokens):
        this.setState({
          customAddressError: 'Token has already been added.' /* this.context.t('tokenAlreadyAdded')*/,
        })

        break
      default:
        if (customAddress !== emptyAddr) {
          this.attemptToAutoFillTokenParams(customAddress)
        }
    }
  }

  handleCustomSymbolChange = (value) => {
    const customSymbol = value.trim()
    const symbolLength = customSymbol.length
    let customSymbolError = null

    if (symbolLength <= 0 || symbolLength >= 10) {
      customSymbolError = 'Symbol must be between 0 and 10 characters.' /* this.context.t('symbolBetweenZeroTen')*/
    }

    this.setState({ customSymbol, customSymbolError })
  }

  handleCustomDecimalsChange = (value) => {
    const customDecimals = value.trim()
    const validDecimals = customDecimals !== null &&
      customDecimals !== '' &&
      customDecimals >= 0 &&
      customDecimals < 36
    let customDecimalsError = null

    if (!validDecimals) {
      customDecimalsError = 'Decimals must be at least 0, and not over 36.' /* this.context.t('decimalsMustZerotoTen')*/
    }

    this.setState({ customDecimals, customDecimalsError })
  }
}

module.exports = connect(mapStateToProps, mapDispatchToProps)(AddTokenScreen)