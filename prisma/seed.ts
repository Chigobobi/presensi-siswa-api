import { PrismaClient, Role, ActiveStatus, AttendanceSession } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);

  // ============================================================
  // 1. Akun default (password untuk demo lokal)
  // ============================================================
  const adminPassword = await bcrypt.hash('Admin#2026', BCRYPT_ROUNDS);
  const guruPassword = await bcrypt.hash('Guru#2026', BCRYPT_ROUNDS);
  const ketuaPassword = await bcrypt.hash('Ketua#2026', BCRYPT_ROUNDS);

  // ============================================================
  // 2. Kelas
  // ============================================================
  const kelasXI = await prisma.class.upsert({
    where: { nama: 'XI PPLG 1' },
    update: {},
    create: {
      nama: 'XI PPLG 1',
      jurusan: 'Pengembangan Perangkat Lunak dan Gim',
      status: ActiveStatus.active,
    },
  });

  const kelasX = await prisma.class.upsert({
    where: { nama: 'X PPLG 1' },
    update: {},
    create: {
      nama: 'X PPLG 1',
      jurusan: 'Pengembangan Perangkat Lunak dan Gim',
      status: ActiveStatus.active,
    },
  });

  console.log(`✅ Kelas: ${kelasX.nama}, ${kelasXI.nama}`);

  // ============================================================
  // 3. Admin
  // ============================================================
  const admin = await prisma.user.upsert({
    where: { email: 'admin@smkn11jakarta.sch.id' },
    update: {},
    create: {
      email: 'admin@smkn11jakarta.sch.id',
      nama: 'Admin Sekolah',
      passwordHash: adminPassword,
      role: Role.ADMIN,
      status: ActiveStatus.active,
      kelasId: null,
    },
  });

  // ============================================================
  // 4. Guru Piket
  // ============================================================
  const guruPiket = await prisma.user.upsert({
    where: { email: 'piket.senin@smkn11jakarta.sch.id' },
    update: {},
    create: {
      email: 'piket.senin@smkn11jakarta.sch.id',
      nama: 'Guru Piket Senin',
      passwordHash: guruPassword,
      role: Role.GURU_PIKET,
      status: ActiveStatus.active,
      kelasId: null,
    },
  });

  // ============================================================
  // 5. Ketua Kelas
  // ============================================================
  const ketuaKelas = await prisma.user.upsert({
    where: { email: 'aisyah.putri@smkn11jakarta.sch.id' },
    update: {},
    create: {
      email: 'aisyah.putri@smkn11jakarta.sch.id',
      nama: 'Aisyah Putri',
      passwordHash: ketuaPassword,
      role: Role.KETUA_KELAS,
      status: ActiveStatus.active,
      kelasId: kelasXI.id,
    },
  });

  console.log(`✅ Akun: ${admin.email}, ${guruPiket.email}, ${ketuaKelas.email}`);

  // ============================================================
  // 6. Teacher (data guru)
  // ============================================================
  const teacher1 = await prisma.teacher.upsert({
    where: { nip: '198001012006041001' },
    update: {},
    create: {
      nip: '198001012006041001',
      nama: 'Drs. Budi Santoso',
      status: ActiveStatus.active,
    },
  });

  const teacher2 = await prisma.teacher.upsert({
    where: { nip: '198502022010012002' },
    update: {},
    create: {
      nip: '198502022010012002',
      nama: 'Siti Nurhaliza, S.Kom',
      status: ActiveStatus.active,
    },
  });

  console.log(`✅ Guru: ${teacher1.nama}, ${teacher2.nama}`);

  // ============================================================
  // 7. Siswa XI PPLG 1 (5 siswa)
  // ============================================================
  const siswaXI = [
    { nis: '241101', nama: 'Ahmad Fauzi' },
    { nis: '241102', nama: 'Bagas Pratama' },
    { nis: '241103', nama: 'Citra Lestari' },
    { nis: '241104', nama: 'Dimas Saputra' },
    { nis: '241105', nama: 'Eka Rahmawati' },
  ];

  for (const s of siswaXI) {
    await prisma.student.upsert({
      where: { nis: s.nis },
      update: {},
      create: {
        nis: s.nis,
        nama: s.nama,
        kelasId: kelasXI.id,
        status: ActiveStatus.active,
      },
    });
  }

  // ============================================================
  // 8. Siswa X PPLG 1 (3 siswa)
  // ============================================================
  const siswaX = [
    { nis: '251101', nama: 'Fajar Nugroho' },
    { nis: '251102', nama: 'Gita Maharani' },
    { nis: '251103', nama: 'Hendra Wijaya' },
  ];

  for (const s of siswaX) {
    await prisma.student.upsert({
      where: { nis: s.nis },
      update: {},
      create: {
        nis: s.nis,
        nama: s.nama,
        kelasId: kelasX.id,
        status: ActiveStatus.active,
      },
    });
  }

  console.log(`✅ Siswa: ${siswaXI.length + siswaX.length} orang`);

  // ============================================================
  // 9. Jadwal sesi presensi (default)
  // ============================================================
  await prisma.schedule.upsert({
    where: { session: AttendanceSession.PAGI },
    update: {},
    create: {
      session: AttendanceSession.PAGI,
      mulai: '07:00',
      selesai: '12:00',
      terkunci: false,
    },
  });

  await prisma.schedule.upsert({
    where: { session: AttendanceSession.SIANG },
    update: {},
    create: {
      session: AttendanceSession.SIANG,
      mulai: '13:00',
      selesai: '17:00',
      terkunci: false,
    },
  });

  console.log('✅ Jadwal: PAGI 07:00-12:00, SIANG 13:00-17:00');

  console.log('');
  console.log('🎉 Seeding selesai!');
  console.log('');
  console.log('📋 Akun uji (password untuk demo lokal):');
  console.log('   Admin       : admin@smkn11jakarta.sch.id / Admin#2026');
  console.log('   Guru Piket  : piket.senin@smkn11jakarta.sch.id / Guru#2026');
  console.log('   Ketua Kelas : aisyiyah.putri@smkn11jakarta.sch.id / Ketua#2026');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
