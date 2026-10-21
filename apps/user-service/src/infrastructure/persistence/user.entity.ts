import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 254, unique: true, nullable: false })
  email!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 200, nullable: false })
  fullName!: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  department!: string;

  @Column({ type: 'varchar', length: 8, nullable: false })
  status!: string;

  @Column({ type: 'varchar', length: 20, array: true, nullable: false })
  roles!: string[];

  @Column({ name: 'created_at', type: 'timestamptz', nullable: false, default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: false, default: () => 'now()' })
  updatedAt!: Date;
}
