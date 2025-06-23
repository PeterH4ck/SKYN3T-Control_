import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  BelongsTo,
  HasMany,
  ForeignKey,
  Scopes,
  BeforeCreate
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Community } from './Community';
import { Floor } from './Floor';
import { Unit } from './Unit';
import { Device } from './Device';
import { AccessPoint } from './AccessPoint';

@Scopes(() => ({
  active: {
    where: {
      is_active: true
    }
  },
  withFloors: {
    include: [{
      model: Floor,
      as: 'floors',
      include: [{
        model: Unit,
        as: 'units'
      }]
    }]
  },
  withStats: {
    attributes: {
      include: [
        [sequelize.literal('(SELECT COUNT(*) FROM floors WHERE building_id = "Building"."id")'), 'floors_count'],
        [sequelize.literal('(SELECT COUNT(*) FROM units WHERE building_id = "Building"."id")'), 'total_units'],
        [sequelize.literal('(SELECT COUNT(*) FROM units WHERE building_id = "Building"."id" AND owner_id IS NOT NULL)'), 'occupied_units']
      ]
    }
  }
}))
@Table({
  tableName: 'buildings',
  timestamps: true,
  underscored: true
})
export class Building extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Community)
  @AllowNull(false)
  @Column(DataType.UUID)
  community_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  code!: string;

  @AllowNull(false)
  @Column(DataType.STRING(200))
  name!: string;

  @Column(DataType.TEXT)
  address?: string;

  @Default(1)
  @Column(DataType.INTEGER)
  floors_count!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  units_count!: number;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: any;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Asociaciones
  @BelongsTo(() => Community)
  community?: Community;

  @HasMany(() => Floor)
  floors?: Floor[];

  @HasMany(() => Unit)
  units?: Unit[];

  @HasMany(() => Device)
  devices?: Device[];

  @HasMany(() => AccessPoint)
  accessPoints?: AccessPoint[];

  // Hooks
  @BeforeCreate
  static async generateCode(building: Building) {
    if (!building.code) {
      const count = await Building.count({
        where: { community_id: building.community_id }
      });
      building.code = `B${(count + 1).toString().padStart(3, '0')}`;
    }
  }

  // Métodos de instancia
  async getOccupancyRate(): Promise<number> {
    const units = await Unit.findAll({
      where: { building_id: this.id }
    });

    if (units.length === 0) return 0;

    const occupiedUnits = units.filter(unit => unit.owner_id || unit.tenant_id);
    return (occupiedUnits.length / units.length) * 100;
  }

  async createFloors(count: number): Promise<Floor[]> {
    const floors: Floor[] = [];
    
    for (let i = 1; i <= count; i++) {
      const floor = await Floor.create({
        building_id: this.id,
        floor_number: i,
        name: `Piso ${i}`
      });
      floors.push(floor);
    }

    this.floors_count = count;
    await this.save();

    return floors;
  }

  // Métodos estáticos
  static async findByCode(communityId: string, code: string): Promise<Building | null> {
    return this.findOne({
      where: {
        community_id: communityId,
        code: code
      }
    });
  }
}