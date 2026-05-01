import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TenantService } from "../../tenant/tenant.service";
import type { SignUploadRequest, SignUploadResponse } from "@pos/contracts";

const EXTENSION_FOR_CONTENT_TYPE: Record<SignUploadRequest["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const EXPIRES_IN_SECONDS = 300;

@Injectable()
export class UploadsService {
  constructor(private readonly tenant: TenantService) {}

  async sign(input: SignUploadRequest): Promise<SignUploadResponse> {
    const config = this.readConfig();
    const tenantId = this.tenant.getTenantId();
    const ext = EXTENSION_FOR_CONTENT_TYPE[input.contentType];
    const key = `tenants/${tenantId}/menu/${randomUUID()}.${ext}`;

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });

    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.contentLength
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: EXPIRES_IN_SECONDS
    });

    return {
      uploadUrl,
      publicUrl: `${config.publicUrl.replace(/\/$/, "")}/${key}`,
      key,
      expiresInSeconds: EXPIRES_IN_SECONDS
    };
  }

  private readConfig() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
      throw new ServiceUnavailableException(
        "R2 storage is not configured on this server"
      );
    }

    return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
  }
}
