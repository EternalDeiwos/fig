import { FHCommonCatalogData } from './FHCommonCatalogData.ts'
import { FHStruct, JsonArray, JsonObject } from './FHStruct.ts'
import { FHStructLoader, NonBPError, SuperStructNode } from './FHStructLoader.ts'

export class FHCatalogBuilder {
  private catalog: JsonObject[] = []

  constructor(
    private readonly loader: FHStructLoader,
    private readonly common: FHCommonCatalogData,
    private readonly baseUrl: string = '',
  ) {}

  getLoader() {
    return this.loader
  }

  getCommon() {
    return this.common
  }

  getCatalog() {
    return this.catalog
  }

  static async init(loader: FHStructLoader, url?: string) {
    return new FHCatalogBuilder(loader, await FHCommonCatalogData.init(loader), url)
  }

  async load(path: string) {
    for (const entryStruct of await this.loader.globStructs(path)) {
      if (!entryStruct) {
        continue
      }

      if (entryStruct.getPath().includes('BPRareMaterialsPickup')) {
        // RareMaterials and RareMetal have the same icon, and only RareMetal is used in game?
        continue
      }

      try {
        const objectValues: JsonObject = await this.coalesceObject(entryStruct)

        if (
          objectValues.CodeName &&
          objectValues.DisplayName &&
          objectValues.Description &&
          objectValues.Icon &&
          (objectValues.TechID || '') !== 'ETechID::ETechID_MAX' &&
          (objectValues.ItemCategory ||
            objectValues.VehicleProfileType ||
            objectValues.BuildLocationType == 'EBuildLocationType::ConstructionYard' ||
            objectValues.ProfileType == 'EStructureProfileType::Shippable')
        ) {
          this.catalog.push(objectValues)
        }
      } catch (error) {
        if (error instanceof NonBPError) {
          continue
        }

        throw error
      }
    }
  }

  private async coalesceObject(struct: FHStruct) {
    const combinedObject: JsonObject = {
      ObjectPath: struct.getPath(),
    }

    const coreProperties = [
      ['CodeName'],
      ['ChassisName', 'SourceString'],
      ['DisplayName', 'SourceString'],
      ['Description', 'SourceString'],
      ['Encumbrance'],
      ['EquipmentSlot'],
      ['ItemCategory'],
      ['ItemProfileType'],
      ['ProfileType'],
      ['FactionVariant'],
      ['TechID'],
      ['ItemFlagsMask'],
      ['Icon', 'ObjectPath'],
      ['SubTypeIcon', 'ResourceObject', 'ObjectPath'],
      ['ItemComponentClass'],
      ['VehicleProfileType'],
      ['VehicleMovementProfileType'],
      ['ArmourType'],
      ['ShippableInfo', 'Type'],
      ['FuelTank', 'FuelCapacity'],
      ['DepthCuttoffForSwimDamage'],
      ['BuildLocationType'],
      ['MaxHealth'],
      ['VehiclesPerCrateBonusQuantity'],
      ['VehicleBuildType'],
      ['MapIconType'],
      ['BuildLocationFilter'],
      ['BoostSpeedModifier'],
      ['BoostGasUsageModifier'],
      ['bCanUseStructures'],
      ['bIsLarge'],
      ['bRequiresCoverOrLowStanceToInvoke'],
      ['bRequiresVehicleToBuild'],
      ['bSupportsVehicleMounts'],
    ]

    struct.extractValues(['Properties'], coreProperties, combinedObject)

    if (Object.hasOwn(combinedObject, 'Icon')) {
      const iconPath = (combinedObject.Icon as string).replace(/(\.[0-9]+)?$/, '.png')
      combinedObject.Icon = `${this.baseUrl}/${iconPath}`
    }

    if (Object.hasOwn(combinedObject, 'SubTypeIcon')) {
      const iconPath = (combinedObject.SubTypeIcon as string).replace(
        /(\.[0-9]+)?$/,
        '.png',
      )
      combinedObject.SubTypeIcon = `${this.baseUrl}/${iconPath}`
    }

    const ammoTypes = new Set()
    const itemComponent = await this.loader.getStructFromReference(
      combinedObject.ItemComponentClass as SuperStructNode,
    )

    if (itemComponent) {
      const componentProperties = [
        ['ProjectileClasses'],
        ['EquippedGripType'],
        ['FiringMode'],
        ['FiringRate'],
        ['MultiAmmo', 'CompatibleAmmoNames'],
        ['CompatibleAmmoCodeName'],
        ['DeployCodeName'],
        ['SafeItem'],
        ['bCanFireFromVehicle'],
        ['bIsSingleUse'],
      ]

      combinedObject.ItemComponentClass = {
        ObjectPath: itemComponent.getPath(),
      }
      itemComponent.extractValues(
        ['Properties'],
        componentProperties,
        combinedObject.ItemComponentClass,
      )

      const componentData = combinedObject.ItemComponentClass
      ammoTypes.add(componentData.CompatibleAmmoCodeName)
      for (const e of Array.isArray(componentData.MultiAmmo) ? componentData.MultiAmmo : []) {
        ammoTypes.add(e)
      }

      if (componentData.ProjectileClasses) {
        if (
          Array.isArray(componentData.ProjectileClasses) &&
          componentData.ProjectileClasses.length === 1
        ) {
          const projectileDataClass = componentData.ProjectileClasses[0] as JsonObject
          const projectileData = await this.loader.getStruct(
            projectileDataClass.ObjectPath as string,
          )

          const projectileProperties = [
            ['ExplosiveCodeName'],
            ['AutoDetonateTime'],
            ['PenetrationBonusMaxRange'],
            ['ProjectileDeathDelay'],
          ]

          componentData.ProjectileClass = projectileData?.extractValues(
            ['Properties'],
            projectileProperties,
          )

          ammoTypes.add(componentData.ProjectileClass?.ExplosiveCodeName)
        }
        delete componentData.ProjectileClasses
      }

      ammoTypes.delete(undefined)

      if (ammoTypes.has('RPGAmmo')) {
        ammoTypes.add('RpgAmmo')
        ammoTypes.delete('RPGAmmo')
      }
    }

    if (combinedObject.CodeName == 'WaterBucket' && ammoTypes.size > 1) {
      // There are two damage types?  We need the SubTypeIcon below, so get rid of one type here.
      ammoTypes.delete('Water')
    }

    const ammoProperties = [
      ['Damage'],
      ['Suppression'],
      ['ExplosionRadius'],
      ['DamageType', 'ObjectPath'],
      ['DamageInnerRadius'],
      ['DamageFalloff'],
      ['AccuracyRadius'],
      ['EnvironmentImpactAmount'],
    ]

    let ammoName = combinedObject.CodeName as string
    if (ammoTypes.size == 1) {
      ammoName = ammoTypes.values().next().value as string
    }

    const ammoValues = this.common.ammoDynamicData?.extractValues(
      ['Rows', ammoName],
      ammoProperties,
    )
    if (ammoValues && Object.keys(ammoValues).length) {
      ammoValues.ObjectPath = this.common.ammoDynamicData?.getPath()
      combinedObject.AmmoDynamicData = ammoValues

      const damageType = ammoValues.DamageType as string | undefined
      if (damageType && damageType.startsWith('War/')) {
        const damageTypeStruct = await this.loader.getStruct(damageType)

        const damageTypeProperties = [
          ['DisplayName', 'SourceString'],
          ['Type'],
          ['DescriptionDetails'],
          ['Icon', 'ResourceObject', 'ObjectPath'],
          ['TankArmourEffectType'],
          ['TankArmourPenetrationFactor'],
          ['VehicleSubSystemOverride'],
          ['VehicleSubSystemOverride'],
          ['VehicleSubsystemDisableMultipliers'],
          ['bApplyTankArmourMechanics'],
          ['bApplyTankArmourAngleRangeBonuses'],
          ['bCanRuinStructures'],
          ['bApplyDamageFalloff'],
          ['bCanWoundCharacter'],
          ['bAlwaysAppliesBleeding'],
          ['bExposeInUI'],
        ]

        ammoValues.DamageType = {
          ObjectPath: damageTypeStruct?.getPath(),
        }
        damageTypeStruct?.extractValues(['Properties'], damageTypeProperties, ammoValues.DamageType)

        const damageTypeValues = ammoValues.DamageType

        if (Object.hasOwn(damageTypeValues, 'Icon')) {
          const iconPath = (damageTypeValues.Icon as string).replace(/(\.[0-9]+)?$/, '.png')
          damageTypeValues.Icon = `${this.baseUrl}/${iconPath}`
        }

        if (damageTypeValues.DescriptionDetails) {
          damageTypeValues.DescriptionDetails = FHStruct.combineDetails(
            damageTypeValues.DescriptionDetails as JsonArray,
          )
        }

        if (
          !Object.hasOwn(combinedObject, 'SubTypeIcon') &&
          !(combinedObject.ItemFlagsMask || 0 & 128)
        ) {
          combinedObject.SubTypeIcon = ammoValues.DamageType.Icon
        }
      }
    }

    if (combinedObject.CodeName == 'ISGTC' && !combinedObject.SubTypeIcon) {
      combinedObject.SubTypeIcon =
        `${this.baseUrl}/War/Content/Textures/UI/ItemIcons/SubtypeSEIcon.png`
    }

    const grenadeProperties = [['MinTossSpeed'], ['MaxTossSpeed'], ['GrenadeFuseTimer'], [
      'GrenadeRangeLimit',
    ]]
    this.common.grenadeDynamicData?.bundleValues(
      ['Rows', combinedObject.CodeName as string],
      grenadeProperties,
      (v) => (combinedObject.GrenadeDynamicData = v),
    )

    const weaponProperties = [
      ['SuppressionMultiplier'],
      ['MaxAmmo'],
      ['MaxApexHalfAngle'],
      ['BaselineApexHalfAngle'],
      ['StabilityCostPerShot'],
      ['Agility'],
      ['CoverProvided'],
      ['StabilityFloorFromMovement'],
      ['StabilityGainRate'],
      ['MaximumRange'],
      ['MaximumReachability'],
      ['DamageMultiplier'],
      ['ArtilleryAccuracyMinDist'],
      ['ArtilleryAccuracyMaxDist'],
      ['MaxVehicleDeviationAngle'],
    ]
    this.common.weaponDynamicData?.bundleValues(
      ['Rows', combinedObject.CodeName as string],
      weaponProperties,
      (v) => (combinedObject.WeaponDynamicData = v),
    )

    // TODO: Replace with data lookups instead of hard-coding.
    const materialNames = {
      Cloth: 'Basic Materials', // BPBasicMaterials.uasset
      Wood: 'Refined Materials', // BPRefinedMaterials.uasset
      Explosive: 'Explosive Powder', // BPExplosiveMaterial.uasset
      HeavyExplosive: 'Heavy Explosive Powder', // BPHeavyExplosiveMaterial.uasset
    } as const

    const productionProperties = [
      ['CostPerCrate'],
      ['QuantityPerCrate'],
      ['CrateProductionTime'],
      ['SingleRetrieveTime'],
      ['CrateRetrieveTime'],
    ]
    this.common.itemDynamicData?.bundleValues(
      ['Rows', combinedObject.CodeName as string],
      productionProperties,
      (values) => {
        combinedObject.ItemDynamicData = values

        if (!values) {
          return
        }

        for (
          const item of Array.isArray(values.CostPerCrate)
            ? values.CostPerCrate as JsonObject[]
            : []
        ) {
          item.DisplayName = materialNames[item.ItemCodeName as keyof typeof materialNames]
        }
      },
    )

    const profileProperties = [
      ['bIsStockpilable'],
      ['bIsStackable'],
      ['bIsConvertibleToCrate'],
      ['bIsCratable'],
      ['bIsStockpiledWithAmmo'],
      ['bUsableInVehicle'],
      ['StackTransferLimit'],
      ['RetrieveQuantity'],
      ['ReserveStockpileMaxQuantity'],
    ]

    this.common.itemProfiles?.bundleValues(
      ['Properties', 'ItemProfileTable', combinedObject.ItemProfileType as string],
      profileProperties,
      (v) => (combinedObject.ItemProfileData = v),
    )

    const vehicleDynamicProperties = [
      ['ResourceRequirements'],
      ['MaxHealth'],
      ['MinorDamagePercent'],
      ['MajorDamagePercent'],
      ['RepairCost'],
      ['ResourcesPerBuildCycle'],
      ['ItemHolderCapacity'],
      ['FuelCapacity'],
      ['FuelConsumptionPerSecond'],
      ['SwimmingFuelConsumptionModifier'],
      ['DefaultSurfaceMovementRate'],
      ['OffroadSnowPenalty'],
      ['ReverseSpeedModifier'],
      ['RotationRate'],
      ['RotationSpeedCuttoff'],
      ['SpeedSqrThreshold'],
      ['EngineForce'],
      ['MassOverride'],
      ['TankArmour'],
      ['MinTankArmourPercent'],
      ['TankArmourMinPenetrationChance'],
      ['VehicleSubsystemDisableChances'],
      ['bHasTierUpgrades'],
    ]

    const vehicleDynamicValues = this.common.vehicleDynamicData?.extractValues(
      ['Rows', combinedObject.CodeName as string],
      vehicleDynamicProperties,
    )
    if (vehicleDynamicValues && Object.keys(vehicleDynamicValues).length) {
      vehicleDynamicValues.ObjectPath = this.common.vehicleDynamicData?.getPath()
      combinedObject.VehicleDynamicData = vehicleDynamicValues

      /*
      const resources = [];
      for (const entry of Object.entries(vehicleDynamicValues.ResourceRequirements)) {
        if (entry[1] == 0) {
          continue;
        }

        resources.push({
          ItemCodeName: entry[0],
          DisplayName: materialNames[entry[0]],
          Quantity: entry[1],
        });
      }
      vehicleDynamicValues.ResourceRequirements = resources;
      */
    }

    const vehicleProfileProperties = [
      ['bUsesRollTrace'],
      ['bCanTriggerMine'],
      ['RamDamageDealtFlags'],
      ['bUsesGas'],
      ['DrivingSpeedThreshold'],
      ['MaxVehicleAngle'],
      ['bEnableStealth'],
      ['DamageDrivingOverStructures'],
    ]
    this.common.vehicleProfileList?.bundleValues(
      ['Properties', 'VehicleProfileMap', combinedObject.VehicleProfileType as string],
      vehicleProfileProperties,
      (v) => (combinedObject.VehicleProfileData = v),
    )

    const vehicleMovementProfileProperties = [
      ['Mass'],
      ['BrakeForce'],
      ['HandbrakeForce'],
      ['AirResistance'],
      ['RollingResistance'],
      ['LowSpeedEngineForceMultiplier'],
      ['LowGearCutoff'],
      ['CenterOfGravityHeight'],
      ['bUsesDifferentialSteering'],
      ['bCanRotateInPlace'],
    ]
    this.common.vehicleMovementProfileList?.bundleValues(
      [
        'Properties',
        'VehicleMovementProfileMap',
        combinedObject.VehicleMovementProfileType as string,
      ],
      vehicleMovementProfileProperties,
      (v) => (combinedObject.VehicleMovementProfileData = v),
    )

    const structureProfileProperties = [
      ['bSupportsAdvancedConstruction'],
      ['bHasDynamicStartingCondition'],
      ['bIsRepairable'],
      ['bIsOnlyMountableByFriendly'],
      ['bIsUpgradeRotationAllowed'],
      ['bIsUsableFromVehicle'],
      ['bAllowUpgradeWhenDamaged'],
      ['bCanOverlapNonBlockingFoliage'],
      ['bDisallowAdjacentUpgradesInIsland'],
      ['bIncludeInStructureIslands'],
      ['bCanDecayBePrevented'],
      ['VerticalEjectionDistance'],
      ['bEnableStealth'],
      ['bIsRuinable'],
      ['bBypassesRapidDecayForNearbyStructures'],
      ['bUsesImpactsMaterial'],
    ]
    this.common.structureProfileList?.bundleValues(
      ['Properties', 'StructureProfileMap', combinedObject.ProfileType as string],
      structureProfileProperties,
      (v) => (combinedObject.ProfileData = v),
    )

    const structureDynamicProperties = [
      ['MaxHealth'],
      ['ResourceRequirements'],
      ['DecayStartHours'],
      ['DecayDurationHours'],
      ['RepairCost'],
      ['StructuralIntegrity'],
      ['StoredItemCapacity'],
      ['RamDamageReceivedFlags'],
      ['bCanBeHarvested'],
      ['IsVaultable'],
      ['bIsDamagedWhileDrivingOver'],
    ]
    const structureDynamicValues = this.common.structureDynamicData?.extractValues(
      ['Rows', combinedObject.CodeName as string],
      structureDynamicProperties,
    )
    if (structureDynamicValues && Object.keys(structureDynamicValues).length) {
      structureDynamicValues.ObjectPath = this.common.structureDynamicData?.getPath()
      combinedObject.StructureDynamicData = structureDynamicValues

      /*
      const resources = [];
      for (const entry of Object.entries(structureDynamicValues.ResourceRequirements)) {
        if (entry[1] == 0) {
          continue;
        }

        resources.push({
          ItemCodeName: entry[0],
          DisplayName: materialNames[entry[0]],
          Quantity: entry[1],
        });
      }
      structureDynamicValues.ResourceRequirements = resources;
      */
    }

    const productionCategories: JsonObject = {}
    productionCategories.Factory = (
      ((Array.isArray(this.common.factoryProductionCategories)
        ? this.common.factoryProductionCategories as JsonArray
        : []).find((c) =>
          ((c as JsonObject).CategoryItems as JsonArray).find((e) =>
            (e as JsonObject).CodeName == combinedObject.CodeName
          )
        ) || {}) as JsonObject
    ).Type

    productionCategories.MassProductionFactory = (
      ((Array.isArray(this.common.massProductionFactoryProductionCategories)
        ? this.common.massProductionFactoryProductionCategories as JsonArray
        : []).find((c) =>
          ((c as JsonObject).CategoryItems as JsonArray).find((e) =>
            (e as JsonObject).CodeName == combinedObject.CodeName
          )
        ) || {}) as JsonObject
    ).Type

    if (!productionCategories.MassProductionFactory) {
      const vehicleType = combinedObject.VehicleBuildType
      const structureType = combinedObject.BuildLocationType
      if (vehicleType && vehicleType != 'EVehicleBuildType::NotBuildable') {
        productionCategories.MassProductionFactory = 'EFactoryQueueType::Vehicles'
      } else if (
        structureType &&
        (structureType == 'EBuildLocationType::Anywhere' ||
          structureType == 'EBuildLocationType::ConstructionYard')
      ) {
        productionCategories.MassProductionFactory = 'EFactoryQueueType::Structures'
      }
    }

    if (Object.values(productionCategories).filter((e) => !!e).length) {
      combinedObject.ProductionCategories = productionCategories
    }

    return combinedObject
  }
}
