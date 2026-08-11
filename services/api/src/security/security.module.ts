import { Module } from '@nestjs/common'
import { CredentialCryptoService } from './credential-crypto.service'
import { MediaSessionEnvelopeService } from './media-session-envelope.service'
import { OutboundUrlPolicyService } from './outbound-url-policy.service'

@Module({ providers: [CredentialCryptoService, MediaSessionEnvelopeService, OutboundUrlPolicyService], exports: [CredentialCryptoService, MediaSessionEnvelopeService, OutboundUrlPolicyService] })
export class SecurityModule {}
