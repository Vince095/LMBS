/**
 * Wallet status: connect the browser wallet, link it to the account by
 * signing a challenge, and show the on-chain roles it holds.
 * No seed phrase, mnemonic or private key is ever requested.
 */
import React from 'react';
import { useChain } from '../../chain/ChainContext';
import { hasBrowserWallet } from '../../chain/registry';
import { Badge, Button, Card, Notice, short } from './chainUi';

const ROLE_LABELS = {
    DEFAULT_ADMIN_ROLE: 'Governance admin',
    REGISTRAR_ROLE: 'Registrar',
    APPROVER_ROLE: 'Approver',
    IDENTITY_ISSUER_ROLE: 'Identity issuer',
    DISPUTE_OFFICER_ROLE: 'Dispute officer',
    ENCUMBRANCE_OFFICER_ROLE: 'Encumbrance officer',
};

export default function WalletPanel() {
    const { config, account, roles, error, busy, linkedAddress, walletMatchesAccount, connect, linkWallet } = useChain();

    if (config && !config.configured) {
        return <Notice tone="error">The blockchain network is not configured on the server (deploy the contracts and set CHAIN_DEPLOYMENT_FILE).</Notice>;
    }

    return (
        <Card title="Wallet" icon="account_balance_wallet"
            actions={!account
                ? <Button onClick={() => connect().catch(() => {})} busy={busy} disabled={!hasBrowserWallet()}>Connect wallet</Button>
                : !walletMatchesAccount && <Button onClick={() => linkWallet().catch(() => {})} busy={busy}>Link this wallet to my account</Button>}>
            {!hasBrowserWallet() && (
                <Notice>No browser wallet detected. Install MetaMask and import your account. Keys stay in your wallet: this portal never asks for a seed phrase.</Notice>
            )}
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-3 font-public-sans text-body-sm">
                <div><dt className="text-on-surface-variant">Connected wallet</dt><dd className="font-mono">{account ? short(account, 10) : 'Not connected'}</dd></div>
                <div><dt className="text-on-surface-variant">Linked to your account</dt><dd className="font-mono">{linkedAddress ? short(linkedAddress, 10) : 'None yet'}</dd></div>
                <div><dt className="text-on-surface-variant">Verified identity on-chain</dt><dd>{roles ? (roles.identityVerified ? <Badge tone="YES">Verified</Badge> : <Badge tone="NO">Not anchored</Badge>) : '—'}</dd></div>
            </dl>
            {account && linkedAddress && !walletMatchesAccount && (
                <Notice tone="error">The connected wallet is not the one linked to your account. Switch accounts in your wallet or link this one.</Notice>
            )}
            {roles && (
                <div className="flex flex-wrap gap-2">
                    {Object.entries(ROLE_LABELS).filter(([k]) => roles[k]).map(([k, label]) => <Badge key={k} tone="APPROVED">{label}</Badge>)}
                    {!Object.keys(ROLE_LABELS).some((k) => roles[k]) && <span className="font-public-sans text-body-sm text-on-surface-variant">No institutional role on-chain (citizen wallet).</span>}
                </div>
            )}
            {error && <Notice tone="error">{error}</Notice>}
        </Card>
    );
}
