use anyhow::Result;
use async_trait::async_trait;
use next_transform_named_import::{named_import_transform, optimize_barrel, OptimizeBarrelConfig};
use swc_core::{
    common::util::take::Take,
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
    turbopack::module_options::{ModuleRule, ModuleRuleEffect},
};

use super::module_rule_match_js_no_url;

/// Returns a rule which applies the transform for the optimizePackageImports
/// option.
pub fn get_next_named_import_transform_rule(auto_named_import_config: &Vec<String>) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextNamedImport {
        packages: auto_named_import_config.to_vec(),
    }) as _));

    ModuleRule::new(
        module_rule_match_js_no_url(),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(Vc::cell(vec![
            transformer,
        ]))],
    )
}

#[derive(Debug)]
struct NextNamedImport {
    packages: Vec<String>,
}

#[async_trait]
impl CustomTransformer for NextNamedImport {
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        let mut named_import_transform =
            named_import_transform(next_transform_named_import::NamedImportConfig {
                packages: self.packages.clone(),
            });

        //let mut optimize_barrel = optimize_barrel(OptimizeBarrelConfig { wildcard: false });

        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        let p = p.fold_with(&mut named_import_transform);
        //*program = p.fold_with(&mut optimize_barrel);

        *program = p;

        Ok(())
    }
}
