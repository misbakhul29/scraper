import { prisma } from '../lib/prisma';

export type IpStatus = 'PENDING' | 'WHITELIST' | 'BLACKLIST';

export class IpAccessService {
  async requestIp(ip: string, note?: string) {
    const existing = await (prisma as any).ipAccess.findUnique({ where: { ip } });
    if (existing) {
      // If already whitelisted/blacklisted, return current status
      return existing;
    }

    const entry = await (prisma as any).ipAccess.create({ data: { ip, note } });
    return entry;
  }

  async getByIp(ip: string) {
    return await prisma.ipAccess.findUnique({ where: { ip } });
  }

  async list() {
    return await prisma.ipAccess.findMany({ orderBy: { requestedAt: 'desc' } });
  }

  async updateStatus(id: string, status: IpStatus) {
    const data: any = { status };
    if (status === 'WHITELIST') data.approvedAt = new Date();
    return await prisma.ipAccess.update({ where: { id }, data });
  }
}

export const ipAccessService = new IpAccessService();
